import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';

/** Body of every error response. */
export class ApiErrorDto {
  @ApiProperty({ example: 403 }) status!: number;
  @ApiProperty({
    description: '機器可判讀的錯誤代碼，例如 unknown_tenant、tenant_inactive、unauthorized、forbidden、outside_sites、cross_origin、validation_failed、sign_in_unavailable',
    example: 'forbidden',
  })
  code!: string;
  @ApiProperty({ description: '給開發者看的說明，不直接顯示給使用者' }) message!: string;
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict',
  413: 'payload_too_large', 422: 'unprocessable', 429: 'too_many_requests', 503: 'unavailable',
};

/**
 * Every error as `{ status, code, message }`. Exceptions may carry their own `code`, e.g.
 * `new ForbiddenException({ code: 'outside_sites', message: '…' })`. Anything that is not an HttpException is logged
 * and answered with a generic 500, so database errors (which may quote personal data) never reach the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (!(exception instanceof HttpException)) {
      this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception));
      return reply.status(500).send({ status: 500, code: 'internal_error', message: 'Internal server error' });
    }
    const status = exception.getStatus();
    const response = exception.getResponse();
    const body = typeof response === 'string' ? { message: response } : (response as { code?: unknown; message?: unknown; issues?: unknown; report?: unknown });
    const message = typeof body.message === 'string' ? body.message : Array.isArray(body.message) ? body.message.join('; ') : exception.message;
    const code = typeof body.code === 'string' ? body.code : DEFAULT_CODES[status] ?? (status >= 500 ? 'internal_error' : 'http_error');
    return reply.status(status).send({ status, code, message, ...(body.issues ? { issues: body.issues } : {}), ...(body.report ? { report: body.report } : {}) });
  }
}
