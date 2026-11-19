// Ошибки приложения с кодом вместо текста: текст подставляет интерфейс из словаря (errors.*),
// поэтому одна и та же ошибка показывается на языке пользователя.

export type AppErrorCode = 'serverNotConnected' | 'gatewayMissing' | 'telegramOff' | 'notifyServer';

export class AppError extends Error {
  constructor(public code: AppErrorCode) {
    super(code);
  }
}
