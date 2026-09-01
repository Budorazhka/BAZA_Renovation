import { useI18n } from "@/i18n";

interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  startAngle?: number;
}

const CircularProgress = ({ percentage, size = 120, strokeWidth = 8, startAngle = -85 }: CircularProgressProps) => {
    const { t } = useI18n();
  // Не даём stroke превратиться в «бублик»: ограничиваем 12% от размера.
  const cappedStroke = Math.min(strokeWidth, size * 0.12);
  const validStrokeWidth = Math.min(cappedStroke, size * 0.9);
  const radius = Math.max(1, (size - validStrokeWidth) / 2);
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const normalizedPercentage = Math.min(100, Math.max(0, percentage));

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ transform: `rotate(${startAngle}deg)` }}
      >
        {/* Трек */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--border)"
          strokeWidth={validStrokeWidth}
          fill="none"
        />
        {/* Прогресс */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--primary)"
          strokeWidth={validStrokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-normal text-[color:var(--primary)]">
          {Math.round(normalizedPercentage)}%
        </span>
        <span className="text-xs text-[color:var(--muted-foreground)]">
          {t('crm.crm.circularProgress.завершено')}</span>
      </div>
    </div>
  );
};

export default CircularProgress;
