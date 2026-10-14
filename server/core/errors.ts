// Ошибка приложения: HTTP-статус + машинный код (клиент переводит его ключом словаря `error.<code>`)
// + параметры + английский текст для логов и прямых API-клиентов.
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    public params: Record<string, unknown> = {},
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const forbidden = (permission: string) =>
  new AppError(403, 'forbidden', { permission }, `Missing permission: ${permission}`);
export const notFound = (entity: string, id?: string) => new AppError(404, 'not_found', { entity, id }, `${entity} not found`);
export const badRequest = (code: string, params: Record<string, unknown> = {}, message?: string) =>
  new AppError(400, code, params, message);
export const conflict = (code: string, params: Record<string, unknown> = {}, message?: string) =>
  new AppError(409, code, params, message);
export const unprocessable = (code: string, params: Record<string, unknown> = {}, message?: string) =>
  new AppError(422, code, params, message);
