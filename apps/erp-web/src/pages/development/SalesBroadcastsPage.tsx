import { RealtorNotificationsPanel } from '@/components/development/sales/RealtorNotificationsPanel'
import { SalesScreenLayout } from '@/components/development/sales/SalesScreenLayout'

export function SalesBroadcastsPage() {
  return (
    <SalesScreenLayout>
      {({ project, readOnly }) => (
        <RealtorNotificationsPanel
          project={project}
          readOnly={readOnly}
        />
      )}
    </SalesScreenLayout>
  )
}
