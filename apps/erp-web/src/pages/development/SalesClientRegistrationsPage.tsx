import { SalesScreenLayout } from '@/components/development/sales/SalesScreenLayout'
import { ClientRegistrationsPanel } from '@/components/development/sales/ClientRegistrationsPanel'

export function SalesClientRegistrationsPage() {
  return (
    <SalesScreenLayout>
      {({ project, readOnly }) => (
        <ClientRegistrationsPanel project={project} readOnly={readOnly} />
      )}
    </SalesScreenLayout>
  )
}
