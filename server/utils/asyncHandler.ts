import { NextFunction, Request, Response } from "express";

/**
 * Оборачивает контроллер так, чтобы любая синхронная ошибка (throw) или
 * отклонённый промис попадали в next(err) -> глобальный error middleware,
 * а не валили весь процесс Node.js. Один сломанный заказ/бронь одного
 * тенанта не должен останавливать сервер для всех остальных ресторанов.
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => unknown
) {
  return (req: Req, res: Response, next: NextFunction) => {
    try {
      const result = fn(req, res, next);
      if (result && typeof (result as Promise<unknown>).catch === "function") {
        (result as Promise<unknown>).catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
}
