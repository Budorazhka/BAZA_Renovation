# Спека: Обновление досье клиента на фронте

## Что изменилось на бэкенде

`IClientDossier` получил 16 новых структурированных объектов. Существующие поля (`summary`, `clientIntent`, `budget`, `location`, `readiness`, `characteristics`, `risks`, `aiIntentions`, `suggestedReplies`, `clientParams`) остались без изменений.

## 1. Обновить TypeScript-тип

Скопировать `IClientDossier` и все новые интерфейсы из:
`TG-WA-backend/src/types/clientDossier.ts`

Новые интерфейсы для импорта:
```
DossierProfile, DossierGoals, DossierGeography, DossierFinance,
DossierPropertyProfile, DossierObjections, DossierDecisionMakers,
DossierCommunication, DossierBehavior, DossierInvestmentProfile,
DossierMatchingProfile, DossierScoring, DossierTrust,
DossierLegalReadiness, DossierRecommendations, DossierDataQuality
```

## 2. Что отображать в UI

### Блок 1: Краткое AI-резюме (замена текущего summary)
- `summary` — главный текст вверху карточки
- `scoring.temperature` — индикатор температуры (цвет: 0-20 серый, 20-60 жёлтый, 60-100 зелёный)
- `scoring.dealProbability` — процент вероятности сделки

### Блок 2: Цель клиента
- `goals.goalType` — бейдж (жизнь / инвестиция / аренда / релокация / капитал / бизнес)
- `goals.goalDetail` — описание
- `goals.emotionalTriggers` — теги

### Блок 3: География
- `geography.city`, `geography.district`, `geography.microLocation`
- `geography.undesirableZones` — красный список
- `geography.geoLogic` — почему именно эта локация

### Блок 4: Финансы
- `finance.totalBudget`, `finance.comfortableBudget`, `finance.maxBudget`
- `finance.downPayment`, `finance.installment`, `finance.credit`
- `finance.currency`, `finance.purchaseTimeline`
- `finance.priceSensitivity` — бейдж (высокая/средняя/низкая)

### Блок 5: Желаемый объект
- `propertyProfile.propertyType`, `propertyProfile.rooms`, `propertyProfile.areaMin`-`areaMax`
- `propertyProfile.view`, `propertyProfile.condition`, `propertyProfile.deliveryDate`
- `propertyProfile.unwanted` — красный список "НЕ предлагать"

### Блок 6: Инвестиционный профиль (показывать если goalType === 'investment')
- `investmentProfile.investorType`
- `investmentProfile.mainInvestmentGoal`
- `investmentProfile.investmentHorizon`
- `investmentProfile.attitudeToRisk`

### Блок 7: Возражения
- `objections.mainObstacle` — главный красный блок
- `objections.howToRemove` — как снять
- `objections.fears` — список страхов
- `objections.churnRisk` — индикатор риска ухода

### Блок 8: Лица решения
- `decisionMakers.decisionMaker`, `decisionMakers.whoPays`
- `decisionMakers.influencers`, `decisionMakers.opponents`

### Блок 9: Коммуникация
- `communication.preferredChannel` — иконка канала
- `communication.bestTimeToContact`
- `communication.communicationStyle`, `communication.tone`

### Блок 10: Скоринги
- `scoring.temperature` — полоска 0-100
- `scoring.dealProbability` — полоска 0-100
- `scoring.leadQuality` — полоска 0-100
- `scoring.investmentMaturity` — бейдж (новичок/изучает/опытный/профессионал)
- `scoring.competitorChurnRisk` — полоска 0-100

### Блок 11: Доверие
- `trust.trustToManager`, `trust.trustToPlatform`, `trust.trustToCountry`, `trust.trustToDevelopers`

### Блок 12: Юридическая готовность
- `legalReadiness.dealReadiness`, `legalReadiness.documentsReady`, `legalReadiness.moneyReady`

### Блок 13: Рекомендации AI
- `recommendations.whatToOffer` — зелёный список
- `recommendations.whatNotToOffer` — красный список
- `recommendations.managerTask` — выделенный блок

### Блок 14: Качество данных
- `dataQuality.aiConfidence` — процент уверенности
- `dataQuality.needsClarification` — жёлтый список "Уточнить"
- `dataQuality.confirmedFacts` vs `dataQuality.assumptions`

## 3. Не показывать на фронте

- `clientParams` — backend-only (уже стрипается через `stripBackendOnlyDossier`)
- `profile` — дублирует данные из других источников (контакты есть в карточке лида)

## 4. Порядок реализации

Приоритет по ценности для риэлтора:
1. **Скоринги** (температура, вероятность) — сразу видно насколько клиент горячий
2. **Возражения + как снять** — главные тормоза сделки
3. **Рекомендации AI** — что предлагать / не предлагать
4. **Цель + география** — что клиент хочет и где
5. **Финансы** — бюджет, сроки, рассрочка
6. **Желаемый объект** — тип, площадь, вид
7. **Юридическая готовность** — документы, деньги
8. **Остальное** — доверие, коммуникация, лица решения
