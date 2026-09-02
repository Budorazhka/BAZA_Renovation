import { useI18n } from '@/i18n';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDisableScroll } from '../../hooks/useDisableScroll';
import { PhoneInput } from '../common/PhoneInput';

interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (leadData: { name: string; lastName: string; phone: string; email?: string }) => Promise<void>;
  selectedProduct: 'RP' | 'Net' | 'Owner' | 'Agent';
}

const AddLeadModal: React.FC<AddLeadModalProps> = ({ isOpen, onClose, onSubmit, selectedProduct }) => {
  const { t } = useI18n();
  useDisableScroll(isOpen);
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Сброс полей при открытии модалки или смене selectedProduct
  useEffect(() => {
    if (isOpen) {
      setName('');
      setLastName('');
      setPhone('');
      setEmail('');
    }
  }, [isOpen, selectedProduct]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Помечаем все поля как "тронутые" при попытке отправки
    
    if (name.trim() && lastName.trim() && phone.trim() && !isSubmitting) {
      setIsSubmitting(true);
      try {
        await onSubmit({ name, lastName, phone, email: email.trim() || undefined });
        setName('');
        setLastName('');
        setPhone('');
        setEmail('');
      } catch (error) {
        console.error('Error submitting lead:', error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setName('');
    setLastName('');
    setPhone('');
    setEmail('');
    onClose();
  };

  return createPortal(
    <div className="modal-fade-in fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-50 pt-[15px] md:pt-4 pb-0 md:pb-4 px-0 md:px-4 transition-all duration-300 ease-out animate-in fade-in" onClick={handleClose}>
      <div className="relative flex flex-col bg-white rounded-t-[25px] md:rounded-[25px] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 w-full md:w-auto md:max-w-5xl h-[85vh] md:h-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center px-12.5 py-4 border-b border-gray-200">
          <span className="text-dream-primary text-lg font-normal">{t('addLeadModal.title')}</span>
        </div>
        <div className="flex-1 flex flex-col justify-center items-center px-12.5 py-8">
          <form onSubmit={handleSubmit} className="w-full">
            <div className="grid grid-cols-2 gap-6">
              {/* Первый столбец: Имя и Телефон */}
              <div className="space-y-6">
                <div className="relative w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <label htmlFor="name" className="block text-sm font-normal text-dream-primary">{t('addLeadModal.firstName')}</label>
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-normal shadow-md" style={{ backgroundColor: '#EF4444', color: '#FFFFFF' }}>*</span>
                    {!name.trim() && (
                      <span className="text-xs font-normal px-2 py-1 rounded-md border" style={{ backgroundColor: '#FEE2E2', color: '#DC2626', borderColor: '#FCA5A5' }}>{t('addLeadModal.requiredField')}</span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                      }}
                      disabled={isSubmitting}
                      className="w-full border-2 rounded-full pl-5 pr-5 py-3 focus:outline-none focus:ring-2 text-lg disabled:bg-gray-100 disabled:cursor-not-allowed transition-all duration-200"
                      style={{ 
                        borderColor: !name.trim() ? '#EF4444' : '#E5E7EB', 
                        backgroundColor: !name.trim() ? '#FEF2F2' : '#FFFFFF',
                      }}
                      onFocus={(e) => {
                        if (!name.trim()) {
                          e.target.style.borderColor = '#EF4444';
                          e.target.style.backgroundColor = '#FEE2E2';
                        } else {
                          e.target.style.borderColor = '#169600';
                          e.target.style.backgroundColor = '#F5F5F5';
                        }
                      }}
                      onBlur={(e) => {
                        if (!name.trim()) {
                          e.target.style.borderColor = '#EF4444';
                          e.target.style.backgroundColor = '#FEF2F2';
                        } else {
                          e.target.style.borderColor = '#E5E7EB';
                          e.target.style.backgroundColor = '#FFFFFF';
                        }
                      }}
                      placeholder={t('addLeadModal.firstNamePlaceholder')}
                      required
                      title={t('addLeadModal.requiredField')}
                    />
                  </div>
                </div>

                <div className="relative w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <label htmlFor="phone" className="block text-sm font-normal text-dream-primary">{t('addLeadModal.phone')}</label>
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-normal shadow-md" style={{ backgroundColor: '#EF4444', color: '#FFFFFF' }}>*</span>
                    {!phone.trim() && (
                      <span className="text-xs font-normal px-2 py-1 rounded-md border" style={{ backgroundColor: '#FEE2E2', color: '#DC2626', borderColor: '#FCA5A5' }}>{t('addLeadModal.requiredField')}</span>
                    )}
                  </div>
                  <div className="relative">
                    <PhoneInput
                      id="phone"
                      value={phone}
                      onChange={setPhone}
                      disabled={isSubmitting}
                      required
                      placeholder={t('addLeadModal.phonePlaceholder')}
                      title={t('addLeadModal.requiredField')}
                      className="w-full border-2 rounded-full pl-5 pr-5 py-3 focus:outline-none focus:ring-2 text-lg disabled:bg-gray-100 disabled:cursor-not-allowed transition-all duration-200"
                      style={{ 
                        borderColor: !phone.trim() ? '#EF4444' : '#E5E7EB', 
                        backgroundColor: !phone.trim() ? '#FEF2F2' : '#FFFFFF',
                      }}
                      onFocus={(e) => {
                        if (!phone.trim()) {
                          e.target.style.borderColor = '#EF4444';
                          e.target.style.backgroundColor = '#FEE2E2';
                        } else {
                          e.target.style.borderColor = '#169600';
                          e.target.style.backgroundColor = '#F5F5F5';
                        }
                      }}
                      onBlur={(e) => {
                        if (!phone.trim()) {
                          e.target.style.borderColor = '#EF4444';
                          e.target.style.backgroundColor = '#FEF2F2';
                        } else {
                          e.target.style.borderColor = '#E5E7EB';
                          e.target.style.backgroundColor = '#FFFFFF';
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Второй столбец: Фамилия и Почта */}
              <div className="space-y-6">
                <div className="relative w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <label htmlFor="lastName" className="block text-sm font-normal text-dream-primary">{t('addLeadModal.lastName')}</label>
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-normal shadow-md" style={{ backgroundColor: '#EF4444', color: '#FFFFFF' }}>*</span>
                    {!lastName.trim() && (
                      <span className="text-xs font-normal px-2 py-1 rounded-md border" style={{ backgroundColor: '#FEE2E2', color: '#DC2626', borderColor: '#FCA5A5' }}>{t('addLeadModal.requiredField')}</span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                      }}
                      disabled={isSubmitting}
                      className="w-full border-2 rounded-full pl-5 pr-5 py-3 focus:outline-none focus:ring-2 text-lg disabled:bg-gray-100 disabled:cursor-not-allowed transition-all duration-200"
                      style={{ 
                        borderColor: !lastName.trim() ? '#EF4444' : '#E5E7EB', 
                        backgroundColor: !lastName.trim() ? '#FEF2F2' : '#FFFFFF',
                      }}
                      onFocus={(e) => {
                        if (!lastName.trim()) {
                          e.target.style.borderColor = '#EF4444';
                          e.target.style.backgroundColor = '#FEE2E2';
                        } else {
                          e.target.style.borderColor = '#169600';
                          e.target.style.backgroundColor = '#F5F5F5';
                        }
                      }}
                      onBlur={(e) => {
                        if (!lastName.trim()) {
                          e.target.style.borderColor = '#EF4444';
                          e.target.style.backgroundColor = '#FEF2F2';
                        } else {
                          e.target.style.borderColor = '#E5E7EB';
                          e.target.style.backgroundColor = '#FFFFFF';
                        }
                      }}
                      placeholder={t('addLeadModal.lastNamePlaceholder')}
                      required
                      title={t('addLeadModal.requiredField')}
                    />
                  </div>
                </div>

                <div className="relative w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <label htmlFor="email" className="block text-sm font-normal text-dream-primary">{t('addLeadModal.email')}</label>
                  </div>
                  <div className="relative">
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                      }}
                      disabled={isSubmitting}
                      className="w-full border-2 rounded-full pl-5 pr-5 py-3 focus:outline-none focus:ring-2 text-lg disabled:bg-gray-100 disabled:cursor-not-allowed transition-all duration-200"
                      style={{ 
                        borderColor: '#E5E7EB', 
                        backgroundColor: '#FFFFFF',
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#169600';
                        e.target.style.backgroundColor = '#F5F5F5';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#E5E7EB';
                        e.target.style.backgroundColor = '#FFFFFF';
                      }}
                      placeholder={t('addLeadModal.emailPlaceholder')}
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || !lastName.trim() || !phone.trim()}
              className="w-full bg-dream-primary text-white rounded-full py-3 px-5 hover:bg-green-700 transition-all duration-200 ease-in-out text-lg font-normal disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6 hover:scale-105 active:scale-95 disabled:hover:scale-100"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>{t('addLeadModal.saving')}</>
              ) : (
                t('addLeadModal.addBtn')
              )}
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AddLeadModal;
