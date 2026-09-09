import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import type { OutboxEventDocument } from '@baza/domain-events';
import {
  BuildingRepository,
  UnitRepository,
  DevelopmentRepository,
  type DevelopmentDocument,
} from '@baza/development';
import { MarketplacePublicationRepository } from '@baza/publication';
import type { EventHandler } from '../outbox/event-handler';
import { computeDevelopmentPublicSummary } from './development-publication.mapper';

@Injectable()
export class UnitPriceChangedHandler implements EventHandler {
  private readonly logger = new Logger(UnitPriceChangedHandler.name);

  constructor(
    private readonly unitRepository: UnitRepository,
    private readonly buildingRepository: BuildingRepository,
    private readonly publicationRepository: MarketplacePublicationRepository,
    private readonly developmentRepository?: DevelopmentRepository,
  ) {}

  async handle(event: OutboxEventDocument): Promise<void> {
    const unitId = new Types.ObjectId(event.aggregateId);
    const unit = await this.unitRepository.findById(unitId);
    if (!unit) {
      this.logger.warn(`UnitPriceChanged: Unit ${unitId.toString()} не найден.`);
      return;
    }

    const building = await this.buildingRepository.findById(unit.buildingId);
    if (building) {
      const developmentId = building.developmentId;
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const devPub = await this.publicationRepository.findBySource('development', developmentId);
        if (!devPub || devPub.status !== 'published') {
          break;
        }

        const buildings = await this.buildingRepository.listByDevelopmentId(developmentId);
        const buildingIds = buildings.map((b) => b._id);
        const availableUnits = await this.unitRepository.listByBuildingIds(buildingIds, { status: 'available' });

        const development = this.developmentRepository
          ? await this.developmentRepository.findById(developmentId)
          : null;

        const devDoc = development ?? ({
          _id: developmentId,
          name: (devPub.denormalizedFields.name as string) || '',
          location: (devPub.denormalizedFields.location as unknown as DevelopmentDocument['location']) || { country: '', city: '', address: '' },
          classType: (devPub.denormalizedFields.classType as unknown as DevelopmentDocument['classType']) || 'comfort',
          startDate: devPub.denormalizedFields.startDate as Date | undefined,
          completionDate: devPub.denormalizedFields.completionDate as Date | undefined,
          description: devPub.denormalizedFields.description as string | undefined,
        } as unknown as DevelopmentDocument);

        const summary = computeDevelopmentPublicSummary({
          development: devDoc,
          buildings,
          availableUnits,
        });

        const updated = await this.publicationRepository.updateProjection(
          devPub._id,
          {
            denormalizedFields: summary.denormalizedFields,
            searchProjection: summary.searchProjection,
          },
          { expectedVersion: devPub.version },
        );

        if (updated) {
          this.logger.log(`UnitPriceChanged: Обновлена проекция ЖК ${developmentId.toString()}, priceFrom=${JSON.stringify(summary.priceFrom)}`);
          break;
        }
        this.logger.warn(`UnitPriceChanged: CAS-конфликт проекции ЖК ${developmentId.toString()} (попытка ${attempt + 1}/${MAX_RETRIES}, version: ${devPub.version})`);
      }
    }

    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const unitPub = await this.publicationRepository.findBySource('unit', unitId);
      if (!unitPub || unitPub.status !== 'published') {
        break;
      }
      const latestUnit = await this.unitRepository.findById(unitId);
      if (!latestUnit) {
        break;
      }
      const denormalized = {
        ...unitPub.denormalizedFields,
        price: {
          amountMinorUnits: latestUnit.price.amountMinorUnits,
          currency: latestUnit.price.currency,
        },
      };
      const searchProjection = {
        ...unitPub.searchProjection,
        priceAmountMinorUnits: latestUnit.price.amountMinorUnits,
        priceCurrency: latestUnit.price.currency,
      };
      const updated = await this.publicationRepository.updateProjection(
        unitPub._id,
        {
          denormalizedFields: denormalized,
          searchProjection,
        },
        { expectedVersion: unitPub.version },
      );
      if (updated) {
        break;
      }
      this.logger.warn(`UnitPriceChanged: CAS-конфликт проекции юнита ${unitId.toString()} (попытка ${attempt + 1}/${MAX_RETRIES}, version: ${unitPub.version})`);
    }
  }
}
