import { cn } from "@/lib/utils";
import type { ActivityMarker, PartnerRow } from "@/types/analytics";
import { useI18n } from "@/i18n";

interface ParticipantCellProps {
    partner: PartnerRow;
}

export function ParticipantCell({ partner }: ParticipantCellProps) {
    const { t } = useI18n();
    const totalMinutesToday = partner.platformMinutesToday + partner.crmMinutesToday;
    const markerMeta = getMarkerMeta(partner.activityMarker);
    const onlineDotClassName = partner.isOnline ? "bg-emerald-500" : "bg-slate-400";
    const displayName = partner.isCurrentUser ? "Я" : partner.name;
    const isPlaceholderAvatar = !partner.avatarUrl || partner.avatarUrl.startsWith("data:image/svg+xml");

    return (
        <div className="flex items-center gap-3">
            <div className="relative">
                {isPlaceholderAvatar ? (
                    <div 
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white shadow-sm border border-emerald-900/10"
                        style={{ backgroundColor: getAvatarBg(displayName) }}
                    >
                        {getInitials(displayName)}
                    </div>
                ) : (
                    <img
                        src={partner.avatarUrl}
                        alt={displayName}
                        className="h-10 w-10 rounded-full object-cover"
                        width={40}
                        height={40}
                    />
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center">
                    <p className="font-medium text-sm truncate">{displayName}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                    {partner.isOnline ? (
                        <span className="font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">{t('crm.analytics-network.participant-cell.в_сети')}</span>
                    ) : (
                        <span className="text-muted-foreground">
                            {partner.lastSeenKnown
                                ? `был(а) ${formatLastSeen(partner.lastSeenMinutesAgo!)}`
                                : "—"}
                        </span>
                    )}
                    <span className={cn("h-2 w-2 rounded-full", onlineDotClassName)} aria-hidden />
                </div>
                <p className="text-xs text-muted-foreground">
                    {!partner.todayMinutesKnown ? (
                        <span className="text-muted-foreground">—</span>
                    ) : totalMinutesToday === 0 ? (
                        <span className={markerMeta.textClassName}>{t('crm.analytics-network.participant-cell.нет_активности_сегод')}</span>
                    ) : (
                        <span className={markerMeta.textClassName}>
                            {t('crm.analytics-network.participant-cell.сегодня')}{formatMinutesToTime(totalMinutesToday)}
                        </span>
                    )}
                </p>
                {typeof partner.totalMinutesLast7 === "number" && partner.totalMinutesLast7 >= 0 && (
                    <p className="text-xs text-muted-foreground">
                        {t('crm.analytics-network.participant-cell.за_7_дней')}{formatMinutesToTime(partner.totalMinutesLast7)}
                    </p>
                )}
            </div>
        </div>
    );
}

function getAvatarBg(name: string): string {
    const colors = [
        "#a07828", // Gold dark
        "#1e4a2a", // Green border / dark green
        "#243933", // Emerald slate
        "#112d1c", // Card background green
        "#163824", // Header green
        "#c9a84c", // Gold secondary
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
}

function getInitials(name: string): string {
    const parts = name.split(" ").filter(Boolean);
    if (parts.length === 0) return "У";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatMinutesToTime(minutes: number): string {
    if (minutes <= 0) return "0 мин.";
    if (minutes < 60) return `${minutes} мин.`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (m === 0) return `${h} ч.`;
    return `${h} ч. ${m} мин.`;
}

function formatLastSeen(minutes: number): string {
    if (minutes < 2) return "только что";
    if (minutes < 60) return `${minutes} мин. назад`;
    const hours = Math.floor(minutes / 60);
    return `${hours} ч. назад`;
}

function getMarkerMeta(marker: ActivityMarker): { textClassName: string } {
    if (marker === "green") {
        return {
            textClassName: "text-emerald-600 dark:text-emerald-400",
        };
    }

    if (marker === "yellow") {
        return {
            textClassName: "text-amber-600 dark:text-amber-400",
        };
    }

    return {
        textClassName: "text-red-600 dark:text-red-400",
    };
}
