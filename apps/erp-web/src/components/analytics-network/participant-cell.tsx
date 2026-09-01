// [DOC-RU]
// Если ты меняешь этот файл, сначала держи прежний смысл метрик и полей, чтобы UI не разъехался.
// Смысл файла: ячейка участника с онлайн-статусом; если ты меняешь статусную логику, держи ее одинаковой с сервером.
// После правок ты проверяешь экран руками и сверяешь ключевые цифры/периоды.

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ActivityMarker, PartnerRow } from "@/types/analytics";
import { useI18n } from "@/i18n";

interface ParticipantCellProps {
    partner: PartnerRow;
}

export function ParticipantCell({ partner }: ParticipantCellProps) {
    const { t } = useI18n();
    const [avatarFailed, setAvatarFailed] = useState(false);
    const totalMinutesToday = partner.platformMinutesToday + partner.crmMinutesToday;
    const markerMeta = getMarkerMeta(partner.activityMarker);
    const onlineDotClassName = partner.isOnline ? "bg-emerald-400" : "bg-white/35";
    const showAvatarFallback = !partner.avatarUrl || avatarFailed;

    return (
        <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-[16px] font-medium text-slate-700 ring-1 ring-white/15"> {/* design-ok: аватар-кружок */}
                {showAvatarFallback ? (
                    <span aria-label={partner.name}>{getInitials(partner.name)}</span>
                ) : (
                    <img
                        src={partner.avatarUrl}
                        alt={partner.name}
                        className="h-full w-full object-cover"
                        width={40}
                        height={40}
                        onError={() => setAvatarFailed(true)}
                    />
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center">
                    <p className="truncate text-[0.9375rem] font-normal leading-snug text-[color:var(--app-text)]">
                        {partner.name}
                    </p>
                </div>
                <div className="flex items-center gap-1.5 text-[0.8125rem] leading-snug">
                    {partner.isOnline ? (
                        <span className="font-normal uppercase tracking-wide text-emerald-700">
                            {t('analytics-network.participant-cell.онлайн')}</span>
                    ) : (
                        <span className="text-[color:var(--app-text-muted)]">
                            {t('analytics-network.participant-cell.был_онлайн')}{formatLastSeen(partner.lastSeenMinutesAgo)}
                        </span>
                    )}
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", onlineDotClassName)} aria-hidden />
                </div>
                <p className="mt-0.5 text-[0.8125rem] leading-snug text-[color:var(--app-text-muted)]">
                    {partner.activityMarker === "red" ? (
                        <span className={markerMeta.textClassName}>{t('analytics-network.participant-cell.не_был_сегодня')}</span>
                    ) : (
                        <span className={markerMeta.textClassName}>
                            {t('analytics-network.participant-cell.сегодня')}{totalMinutesToday} {t('analytics-network.participant-cell.мин')}</span>
                    )}
                </p>
            </div>
        </div>
    );
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "—";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatLastSeen(minutes: number | null): string {
    if (minutes === null) return "только что";
    if (minutes < 60) return `${minutes} мин назад`;

    const hours = Math.floor(minutes / 60);
    return `${hours} ч назад`;
}

function getMarkerMeta(marker: ActivityMarker): { textClassName: string } {
    if (marker === "green") {
        return {
            textClassName: "font-medium text-emerald-700",
        };
    }

    if (marker === "yellow") {
        return {
            textClassName: "font-medium text-amber-800",
        };
    }

    return {
        textClassName: "font-medium text-rose-700",
    };
}
