// [DOC-RU]
// Если ты меняешь этот файл, сначала держи прежний смысл метрик и полей, чтобы UI не разъехался.
// Смысл файла: маленький прогресс-бар для визуального сравнения значений; ты подаешь value и maxValue.
// После правок ты проверяешь экран руками и сверяешь ключевые цифры/периоды.

import { cn } from "@/lib/utils";

interface MiniBarProps {
    value: number;
    maxValue: number;
    color?: string;
    className?: string;
    showValue?: boolean;
}

export function MiniBar({
    value,
    maxValue,
    color = "bg-[#e6c364]",
    className,
    showValue = true
}: MiniBarProps) {
    const percentage = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;

    return (
        <div className={cn("flex items-center gap-2", className)}>
            {showValue && (
                <span className="min-w-0 text-sm font-medium text-right sm:min-w-[2rem]">
                    {value.toLocaleString("ru-RU")}
                </span>
            )}
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-[#315b42] sm:min-w-[60px]">
                <div
                    className={cn("h-full rounded-sm transition-all duration-300", color)}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}
