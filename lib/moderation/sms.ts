export interface SMSVerificationProvider {
  name:string;version:string;
  sendVerification(phoneE164:string,signal:AbortSignal):Promise<{reference:string}>;
  verify(reference:string,code:string,signal:AbortSignal):Promise<{verified:boolean}>;
}
export class UnavailableSMSProvider implements SMSVerificationProvider {
  name='unavailable';version='none';
  async sendVerification():Promise<never>{throw new Error('sms_provider_unavailable');}
  async verify():Promise<never>{throw new Error('sms_provider_unavailable');}
}
export function normalizeKZPhone(phone:string){const p=phone.replace(/[\s()-]/g,'');return /^\+7[67]\d{9}$/.test(p)?p:null;}
