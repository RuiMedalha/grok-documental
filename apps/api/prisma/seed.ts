import { PrismaClient, UserRole, AccountType, PartyType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_ACCOUNTS = [
  { code: '21', name: 'Clientes', type: AccountType.asset },
  { code: '221', name: 'Fornecedores c/c', type: AccountType.liability },
  { code: '31', name: 'Compras', type: AccountType.expense },
  { code: '62', name: 'Fornecimentos e serviços externos', type: AccountType.expense },
  { code: '2432', name: 'IVA dedutível', type: AccountType.asset },
  { code: '2433', name: 'IVA liquidado', type: AccountType.liability },
  { code: '12', name: 'Depósitos à ordem', type: AccountType.asset },
  { code: '71', name: 'Vendas', type: AccountType.revenue },
  { code: '72', name: 'Prestações de serviços', type: AccountType.revenue },
];

async function main() {
  console.log('Seeding database...');

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {
      iban: 'PT50003506510000000000712',
      bic: 'CGDIPTPL',
      bankName: 'Caixa Geral de Depósitos',
    },
    create: {
      name: 'Empresa Demo Lda',
      slug: 'demo',
      nif: '500000000',
      iban: 'PT50003506510000000000712',
      bic: 'CGDIPTPL',
      bankName: 'Caixa Geral de Depósitos',
    },
  });
  console.log('Tenant:', tenant.slug);

  const passwordHash = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.pt' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.pt',
      passwordHash,
      name: 'Admin Demo',
      role: UserRole.ADMIN,
    },
  });
  console.log('Admin:', admin.email);

  await prisma.folderRule.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      tenantId: tenant.id,
      name: 'Padrão por Ano/Mês/Tipo',
      priority: 0,
      conditions: {},
      folderPattern: '/{Ano}/{Mes}/{Tipo}/{Entidade}',
      isActive: true,
    },
  });

  // Chart of accounts
  for (const a of DEFAULT_ACCOUNTS) {
    await prisma.account.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: a.code } },
      update: { name: a.name, type: a.type },
      create: { tenantId: tenant.id, ...a },
    });
  }
  console.log('Accounts seeded:', DEFAULT_ACCOUNTS.length);

  const acc221 = await prisma.account.findFirst({
    where: { tenantId: tenant.id, code: '221' },
  });
  const acc62 = await prisma.account.findFirst({
    where: { tenantId: tenant.id, code: '62' },
  });

  // Sample parties
  await prisma.party.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      tenantId: tenant.id,
      type: PartyType.supplier,
      name: 'EDP Comercial',
      nif: '500697370',
      email: 'faturacao@edp.pt',
      iban: 'PT50000700000000000000000',
      paymentTermDays: 30,
      defaultDebitAccountId: acc62?.id,
      defaultCreditAccountId: acc221?.id,
    },
  });
  await prisma.party.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      tenantId: tenant.id,
      type: PartyType.customer,
      name: 'Cliente Demo SA',
      nif: '501000000',
      email: 'geral@clientedemo.pt',
      paymentTermDays: 30,
    },
  });
  console.log('Parties seeded');

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
