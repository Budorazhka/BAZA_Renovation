// [DOC-RU]
// Если ты меняешь этот файл, сначала держи прежний смысл метрик и полей, чтобы UI не разъехался.
// Смысл файла: вход в карточку конкретного партнёра; тут ты берешь id из URL и передаешь в страницу аналитики.
// После правок ты проверяешь экран руками и сверяешь ключевые цифры/периоды.

import { useMemo, useState } from "react";
import { PersonAnalyticsPage } from "@/features/crm/components/analytics-network/person-analytics-page";
import { useParams, useSearchParams } from "react-router-dom";
import type { AnalyticsPeriod, PersonAnalyticsData } from "@/types/analytics";
import type { PartnerAnalyticsData } from "@/features/crm/pages/crm/hooks/usePartnerAnalyticsBackend";
import { usePartnerAnalyticsBackend } from "@/features/crm/pages/crm/hooks/usePartnerAnalyticsBackend";
import { usePartnerAnalyticsPlan } from "@/features/crm/pages/crm/hooks/usePartnerAnalyticsPlan";

function mapPartnerToPersonAnalytics(
    partner: PartnerAnalyticsData,
    period: AnalyticsPeriod
): PersonAnalyticsData {
    return {
        period,
        periodLabel: partner.periodLabel,
        person: partner.person,
        staticKpi: partner.staticKpi,
        dynamicKpi: partner.dynamicKpi,
        leadsTimeseries: partner.leadsTimeseries,
        activityTimeseries: partner.activityTimeseries,
        monthActivityTimeseries: partner.monthActivityTimeseries,
        allTimeActivityTimeseries: partner.allTimeActivityTimeseries,
        funnels: partner.funnels,
        referrals: [],
        maxLeadsAdded: 1,
        maxStageChangesCount: 1,
    };
}

export default function AnalyticsPartnerPage() {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const [period, setPeriod] = useState<AnalyticsPeriod>("week");
    const { data: partnerData, loading, error, refetch } = usePartnerAnalyticsBackend(id, period);
    const { loadPlan, savePlan, error: planError } = usePartnerAnalyticsPlan(id ?? undefined);
    const data = useMemo(
        () => (partnerData ? mapPartnerToPersonAnalytics(partnerData, period) : null),
        [partnerData, period]
    );
    const showFullAnalytics = searchParams.get("view") === "referral";
    if (!id) return null;
    return (
        <PersonAnalyticsPage
            data={data}
            loading={loading}
            error={error}
            period={period}
            onPeriodChange={setPeriod}
            mode="partner"
            showFullAnalytics={showFullAnalytics}
            refetch={refetch}
            onLoadPlan={loadPlan}
            onSavePlan={savePlan}
            planLoadError={planError}
        />
    );
}
