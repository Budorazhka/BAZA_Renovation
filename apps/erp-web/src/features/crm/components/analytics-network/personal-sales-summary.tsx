import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PersonalSalesSummaryProps {
  title: string;
  totalLeads: number;
  totalDeals: number;
  totalListings: number;
  onlineDays: number;
}

export function PersonalSalesSummary({
  title,
  totalLeads,
  totalDeals,
  totalListings,
  onlineDays,
}: PersonalSalesSummaryProps) {
  const cards = [
    { label: 'Лиды', value: totalLeads },
    { label: 'Сделки', value: totalDeals },
    { label: 'Объекты', value: totalListings },
    { label: 'Дней онлайн', value: onlineDays, suffix: '/7' },
  ];

  return (
    <Card>
      <CardHeader className="pb-2 text-center">
        <CardTitle className="text-center text-base font-medium sm:text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="flex h-full flex-col justify-between rounded-md border p-3 text-center">
            <p className="text-xs leading-snug text-foreground" title={card.label}>{card.label}</p>
            <p className="w-full text-right text-lg font-medium tabular-nums leading-none">
              {card.value.toLocaleString('ru-RU')}
              {'suffix' in card ? card.suffix : ''}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}