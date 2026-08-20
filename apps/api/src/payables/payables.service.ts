import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

function escapeXml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class PayablesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(
    tenantId: string,
    opts: { status?: string; partyId?: string } = {},
  ) {
    const where: any = { tenantId };
    if (opts.status) where.status = opts.status;
    if (opts.partyId) where.partyId = opts.partyId;
    return this.prisma.payableItem.findMany({
      where,
      include: {
        party: true,
        document: { select: { id: true, fileName: true, type: true, docNumber: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async markPaid(tenantId: string, userId: string, id: string, body: any) {
    const item = await this.prisma.payableItem.findFirst({
      where: { id, tenantId },
    });
    if (!item) throw new NotFoundException('Item não encontrado');

    const updated = await this.prisma.payableItem.update({
      where: { id },
      data: {
        status: 'paid',
        paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
        paidAmount: body.paidAmount ?? item.amount,
        paymentMethod: body.paymentMethod || item.paymentMethod || 'other',
        paymentRef: body.paymentRef ?? item.paymentRef,
        bankTxId: body.bankTxId,
        notes: body.notes,
      },
    });

    if (item.documentId) {
      await this.prisma.document.update({
        where: { id: item.documentId },
        data: {
          paymentStatus: 'paid',
          metadata: {
            // merge done at app level if needed — keep simple stamp
          },
        },
      });
      // stamp on document metadata
      const doc = await this.prisma.document.findFirst({
        where: { id: item.documentId, tenantId },
      });
      if (doc) {
        await this.prisma.document.update({
          where: { id: doc.id },
          data: {
            paymentStatus: 'paid',
            metadata: {
              ...((doc.metadata as any) || {}),
              paymentStamp: {
                paidAt: body.paidAt || new Date().toISOString(),
                method: body.paymentMethod || 'other',
                ref: body.paymentRef || null,
                amount: body.paidAmount ?? Number(item.amount),
                payableId: id,
              },
            },
          },
        });
      }
    }

    await this.audit.log({
      tenantId,
      userId,
      action: 'approve',
      entityType: 'payable',
      entityId: id,
      metadata: {
        paid: true,
        paymentMethod: body.paymentMethod || 'other',
        paymentRef: body.paymentRef,
      },
    });

    return updated;
  }

  async summary(tenantId: string) {
    const items = await this.prisma.payableItem.findMany({
      where: { tenantId, status: { in: ['to_pay', 'scheduled'] } },
    });
    const total = items.reduce((s, i) => s + Number(i.amount), 0);
    const overdue = items.filter((i) => i.dueDate && i.dueDate < new Date());
    return {
      openCount: items.length,
      openTotal: total,
      overdueCount: overdue.length,
      overdueTotal: overdue.reduce((s, i) => s + Number(i.amount), 0),
    };
  }

  async exportSepa(
    tenantId: string,
    opts: { format?: 'csv' | 'xml'; status?: string } = {},
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const where: any = { tenantId };
    if (opts.status && opts.status !== 'all') where.status = opts.status;
    else if (!opts.status) where.status = 'to_pay';

    const items = await this.prisma.payableItem.findMany({
      where,
      include: {
        party: true,
        document: { select: { fileName: true, docNumber: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const rows = items.map((i) => ({
      name: i.party?.name || i.description || 'Sem nome',
      iban: i.party?.iban || '',
      amount: Number(i.amount).toFixed(2),
      currency: 'EUR',
      reference: i.document?.docNumber || i.id.slice(0, 8),
      description: (i.description || i.document?.fileName || 'Pagamento').slice(0, 140),
      dueDate: i.dueDate ? i.dueDate.toISOString().slice(0, 10) : '',
      nif: i.party?.nif || '',
    }));

    const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0);

    const debtorIban = tenant?.iban || '';
    const debtorName = tenant?.name || 'Ordenante';
    const debtorBic = tenant?.bic || '';

    if ((opts.format || 'csv') === 'xml') {
      const txXml = rows
        .map(
          (r, idx) => `
    <CdtTrfTxInf>
      <PmtId><EndToEndId>DF-${escapeXml(r.reference)}-${idx + 1}</EndToEndId></PmtId>
      <Amt><InstdAmt Ccy="${r.currency}">${r.amount}</InstdAmt></Amt>
      <Cdtr><Nm>${escapeXml(r.name)}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${escapeXml(r.iban)}</IBAN></Id></CdtrAcct>
      <RmtInf><Ustrd>${escapeXml(r.description)}</Ustrd></RmtInf>
    </CdtTrfTxInf>`,
        )
        .join('');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>DOCFLOW-${Date.now()}</MsgId>
      <CreDtTm>${new Date().toISOString()}</CreDtTm>
      <NbOfTxs>${rows.length}</NbOfTxs>
      <CtrlSum>${total.toFixed(2)}</CtrlSum>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>PMT-${Date.now()}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${rows.length}</NbOfTxs>
      <CtrlSum>${total.toFixed(2)}</CtrlSum>
      <ReqdExctnDt>${new Date().toISOString().slice(0, 10)}</ReqdExctnDt>
      <Dbtr><Nm>${escapeXml(debtorName)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${escapeXml(debtorIban)}</IBAN></Id></DbtrAcct>
      ${debtorBic ? `<DbtrAgt><FinInstnId><BIC>${escapeXml(debtorBic)}</BIC></FinInstnId></DbtrAgt>` : ''}
      ${txXml}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
      return { format: 'xml' as const, content: xml, count: rows.length, total };
    }

    const header = 'Ordenante;IBAN_Ordenante;Nome;IBAN;Montante;Moeda;Referencia;Descricao;DataVencimento;NIF';
    const body = rows
      .map((r) =>
        [
          debtorName,
          debtorIban,
          r.name,
          r.iban,
          r.amount.replace('.', ','),
          r.currency,
          r.reference,
          r.description,
          r.dueDate,
          r.nif,
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(';'),
      )
      .join('\n');
    return {
      format: 'csv' as const,
      content: '\uFEFF' + header + '\n' + body,
      count: rows.length,
      total,
    };
  }
}
