import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { Types } from 'mongoose';

/**
 * D-05B: валидирует path-параметр как MongoDB ObjectId ДО входа в
 * controller-метод — без него `new Types.ObjectId(rawParam)` на невалидной
 * строке бросает необработанный BSONError (500), не структурированную
 * 400-ошибку (error-catalog.md). BadRequestException — AppExceptionFilter
 * уже мапит любой HttpException(400) на ErrorCode.VALIDATION_FAILED
 * автоматически (тот же путь, что встроенный ValidationPipe для DTO-тела),
 * отдельный AppException здесь не нужен.
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, Types.ObjectId> {
  transform(value: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid identifier: ${value}`);
    }
    return new Types.ObjectId(value);
  }
}
