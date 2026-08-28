import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ParseObjectIdPipe } from './parse-object-id.pipe';

describe('ParseObjectIdPipe', () => {
  const pipe = new ParseObjectIdPipe();

  it('возвращает Types.ObjectId для валидного 24-hex значения', () => {
    const valid = new Types.ObjectId().toString();
    const result = pipe.transform(valid);
    expect(result).toBeInstanceOf(Types.ObjectId);
    expect(result.toString()).toBe(valid);
  });

  it('бросает BadRequestException для мусорной строки', () => {
    expect(() => pipe.transform('not-an-object-id')).toThrow(BadRequestException);
  });

  it('бросает BadRequestException для пустой строки', () => {
    expect(() => pipe.transform('')).toThrow(BadRequestException);
  });
});
