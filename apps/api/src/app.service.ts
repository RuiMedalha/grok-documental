import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'docflow-api',
      timestamp: new Date().toISOString(),
    };
  }
}
