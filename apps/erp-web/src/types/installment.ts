export type InstallmentApplyTo = 'unit' | 'project'
export type InstallmentDownPaymentType = 'percent' | 'amount'
export type InstallmentTermType = 'months_from_current_date' | 'fixed_end_date'
export type InstallmentPaymentFrequency = 'monthly' | 'quarterly'

export interface IInstallmentPlan {
  id: string
  title: string
  isActive: boolean
  applyTo: InstallmentApplyTo
  projectId: string
  unitId?: string

  downPaymentType: InstallmentDownPaymentType
  downPaymentValue: number

  termType: InstallmentTermType
  termMonths?: number
  endDate?: string

  paymentFrequency: InstallmentPaymentFrequency
  useDiscount: boolean
  discountFromDownPayment?: boolean
  discountPercent?: number

  description?: string
  sortOrder?: number
  createdAt: string
  updatedAt: string
}

export type NewInstallmentPlan = Omit<IInstallmentPlan, 'id' | 'createdAt' | 'updatedAt'>

export interface InstallmentCalculation {
  priceBase: number
  priceFinal: number
  hasDiscount: boolean
  discountPercent?: number
  downPayment: number
  remaining: number
  paymentsCount: number
  paymentAmount: number
  paymentFrequency: InstallmentPaymentFrequency
  termMonths: number
  endDate: Date
}
