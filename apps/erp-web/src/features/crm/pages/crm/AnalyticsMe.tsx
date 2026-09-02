// [DOC-RU]
// Если ты меняешь этот файл, сначала держи прежний смысл метрик и полей, чтобы UI не разъехался.
// Смысл файла: вход в режим "моя аналитика"; тут ты подставляешь данные с бэкенда.
// После правок ты проверяешь экран руками и сверяешь ключевые цифры/периоды.

import { useMemo, useState } from "react";
import { PersonAnalyticsPage } from "@/features/crm/components/analytics-network/person-analytics-page";
import { useMeAnalyticsData } from "@/features/crm/pages/crm/hooks/useMeAnalyticsData";
import { useOnlinePresenceStats } from "@/features/crm/pages/crm/hooks/useOnlinePresenceStats";
import { useAnalyticsPlan } from "@/features/crm/pages/crm/hooks/useAnalyticsPlan";
import type { AnalyticsPeriod } from "@/types/analytics";

export default function AnalyticsMe() {
    const [period, setPeriod] = useState<AnalyticsPeriod>("week");
    const { data, loading, error, refetch } = useMeAnalyticsData(period);
    const { stats: onlineStats } = useOnlinePresenceStats();
    const { loadPlan, savePlan, error: planError } = useAnalyticsPlan();

    const dataWithOnline = useMemo(() => {
        if (!data) return null;
        return {
            ...data,
            person: {
                ...data.person,
                onlineDaysLast7: onlineStats.onlineDaysLast7,
                isOnline: onlineStats.isOnline ?? data.person.isOnline,
            },
        };
    }, [data, onlineStats.onlineDaysLast7, onlineStats.isOnline]);

    return (
        <PersonAnalyticsPage
            data={dataWithOnline}
            loading={loading}
            error={error}
            period={period}
            onPeriodChange={setPeriod}
            mode="me"
            refetch={refetch}
            onLoadPlan={loadPlan}
            onSavePlan={savePlan}
            planLoadError={planError}
        />
    );
}
