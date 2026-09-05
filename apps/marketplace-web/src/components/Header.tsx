import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthSession } from '../features/auth/model/useAuthSession'

interface HeaderProps {
  onCityChange?: (city: string) => void
  onCurrencyChange?: (currency: string) => void
  onLanguageChange?: (lang: string) => void
}

/**
 * Header Component (Figma Node: 314:7642 / ComponentSet 824:17647 / menu2 381:7139)
 * Dimensions: 1920x74 (desktop), 375x64 (mobile)
 * Font: Plus Jakarta Sans (logo), Comfortaa (navigation items)
 */
export function Header({ onCityChange, onCurrencyChange, onLanguageChange }: HeaderProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, isChecking, logout } = useAuthSession()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)
  const [currentCity, setCurrentCity] = useState('Тбилиси')
  const [currentCurrency, setCurrentCurrency] = useState('USD')
  const [currentLang, setCurrentLang] = useState('RU')

  const [cityDropdownOpen, setCityDropdownOpen] = useState(false)
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState(false)
  const [langDropdownOpen, setLangDropdownOpen] = useState(false)

  const isRent = location.search.includes('dealType=rent_long')
  const isCommercial = location.search.includes('propertyType=commercial')
  const isSecondary = location.search.includes('tab=listings') && !isRent && !isCommercial
  const isDevelopments = !location.search.includes('tab=listings') && (location.pathname === '/' || location.pathname.startsWith('/newconstructions') || location.pathname.startsWith('/developments'))

  const handleCitySelect = (city: string) => {
    setCurrentCity(city)
    setCityDropdownOpen(false)
    onCityChange?.(city)
  }

  const handleCurrencySelect = (curr: string) => {
    setCurrentCurrency(curr)
    setCurrencyDropdownOpen(false)
    onCurrencyChange?.(curr)
  }

  const handleLangSelect = (lang: string) => {
    setCurrentLang(lang)
    setLangDropdownOpen(false)
    onLanguageChange?.(lang)
  }

  return (
    <header className="site-header figma-header" role="banner">
      <div className="figma-header__inner">
        {/* Left: Logo (Figma 1909:32353 [76x43]) */}
        <div className="figma-header__brand">
          <Link to="/" className="wordmark figma-header__logo" aria-label="BAZA, каталог объектов недвижимости">
            BAZA
          </Link>
        </div>

        {/* Center: Main Navigation tabs (Figma 1452:18596 [917x27]) */}
        <nav className="main-nav figma-header__nav" aria-label="Основная навигация">
          <Link
            to="/newconstructions"
            role="tab"
            aria-selected={isDevelopments}
            className={`main-nav__link figma-header__tab${isDevelopments ? ' is-active' : ''}`}
          >
            Новостройки
          </Link>
          <Link
            to="/secondary"
            role="tab"
            aria-label="Вторичка и аренда"
            aria-selected={isSecondary}
            className={`main-nav__link figma-header__tab${isSecondary ? ' is-active' : ''}`}
          >
            Вторичка
          </Link>
          <Link
            to="/newconstructions"
            className="main-nav__link figma-header__tab"
          >
            Проекты
          </Link>
          <Link
            to="/rent"
            className={`main-nav__link figma-header__tab${isRent ? ' is-active' : ''}`}
          >
            Аренда
          </Link>
          <Link
            to="/secondary?propertyType=commercial"
            className={`main-nav__link figma-header__tab${isCommercial ? ' is-active' : ''}`}
          >
            Коммерция
          </Link>
          <Link
            to="/requests"
            className="main-nav__link figma-header__tab"
          >
            Запросы
          </Link>
          <Link
            to="/banks"
            className="main-nav__link figma-header__tab"
          >
            Банки
          </Link>
        </nav>

        {/* Right: Actions block (Figma 381:7150 [710x44]) */}
        <div className="header-actions figma-header__actions">
          {/* Post property CTA button (Figma 381:7151 [166x44]) */}
          <Link
            className="header-action header-action--primary figma-header__publish-btn"
            to="/publish"
            data-testid="header-publish-cta"
          >
            + Разместить
          </Link>

          {/* Language Switcher (Figma 381:7158 [63x24]) */}
          <div className="figma-header__dropdown-wrap">
            <button
              className="header-locale figma-header__btn"
              type="button"
              aria-label="Выбрать язык"
              aria-expanded={langDropdownOpen}
              onClick={() => {
                setLangDropdownOpen(!langDropdownOpen)
                setCurrencyDropdownOpen(false)
                setCityDropdownOpen(false)
              }}
            >
              {currentLang} <span>⌄</span>
            </button>
            {langDropdownOpen && (
              <div className="figma-header__dropdown-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => handleLangSelect('RU')}>RU (Русский)</button>
                <button type="button" role="menuitem" onClick={() => handleLangSelect('EN')}>EN (English)</button>
                <button type="button" role="menuitem" onClick={() => handleLangSelect('KA')}>KA (ქართული)</button>
              </div>
            )}
          </div>

          {/* Currency Switcher (Figma 381:7160 [50x24]) */}
          <div className="figma-header__dropdown-wrap">
            <button
              className="header-locale figma-header__btn"
              type="button"
              aria-label="Выбрать валюту"
              aria-expanded={currencyDropdownOpen}
              onClick={() => {
                setCurrencyDropdownOpen(!currencyDropdownOpen)
                setLangDropdownOpen(false)
                setCityDropdownOpen(false)
              }}
            >
              {currentCurrency === 'USD' ? '$' : currentCurrency === 'GEL' ? '₾' : '₽'} <span>⌄</span>
            </button>
            {currencyDropdownOpen && (
              <div className="figma-header__dropdown-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => handleCurrencySelect('USD')}>$ USD</button>
                <button type="button" role="menuitem" onClick={() => handleCurrencySelect('GEL')}>₾ GEL</button>
                <button type="button" role="menuitem" onClick={() => handleCurrencySelect('RUB')}>₽ RUB</button>
              </div>
            )}
          </div>

          {/* Location / City selector (Figma 381:7162 [128x25]) */}
          <div className="figma-header__dropdown-wrap">
            <button
              className="header-location figma-header__btn figma-header__location-btn"
              type="button"
              aria-label="Выбрать город"
              aria-expanded={cityDropdownOpen}
              onClick={() => {
                setCityDropdownOpen(!cityDropdownOpen)
                setLangDropdownOpen(false)
                setCurrencyDropdownOpen(false)
              }}
            >
              <span className="figma-header__location-dot" aria-hidden="true">●</span>
              <span>{currentCity}</span>
            </button>
            {cityDropdownOpen && (
              <div className="figma-header__dropdown-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => handleCitySelect('Тбилиси')}>Тбилиси</button>
                <button type="button" role="menuitem" onClick={() => handleCitySelect('Батуми')}>Батуми</button>
                <button type="button" role="menuitem" onClick={() => handleCitySelect('Бакуриани')}>Бакуриани</button>
              </div>
            )}
          </div>

          {/* Cabinet / Auth CTA (Figma 381:7193 [163x44]) */}
          {/*
            Кнопка «Войти» вела на /publish — то есть в мастер публикации, где
            вход был лишь первым шагом. Человек, которому нужен кабинет, попадал
            в форму размещения объекта. Теперь ведёт на страницу входа.

            И шапка знает про сессию. Раньше не знала: вошедшему всё равно
            предлагалось войти — видно на снимке кабинета MKT-SCR-019 от
            05.09.2026, где страница показывает объекты человека, а справа висит
            «Войти». Выйти из аккаунта при этом было негде, кроме мастера
            публикации.

            Разделы кабинета собраны в выпадающий список, а не выложены рядом
            новыми кнопками: тот же приём, что уже применён здесь к городу,
            валюте и языку, и он есть в макете (дропдауны 314:7645, 445:11844).
          */}
          {isChecking ? (
            // Пока сессия проверяется, не утверждаем ни того, ни другого:
            // показать «Войти» вошедшему на долю секунды — та же неправда,
            // просто короткая. Место сохраняется, чтобы шапку не дёргало.
            <span
              className="header-action header-action--dark figma-header__cabinet-btn"
              aria-label="Проверяем сессию"
              aria-busy="true"
            />
          ) : isAuthenticated ? (
            <div className="figma-header__dropdown-wrap">
              <button
                className="header-action header-action--dark figma-header__cabinet-btn"
                type="button"
                aria-label="Меню аккаунта"
                aria-expanded={accountDropdownOpen}
                data-testid="header-account-btn"
                onClick={() => {
                  setAccountDropdownOpen(!accountDropdownOpen)
                  setCityDropdownOpen(false)
                  setCurrencyDropdownOpen(false)
                  setLangDropdownOpen(false)
                }}
              >
                <span className="figma-header__cabinet-icon" aria-hidden="true">◔</span>
                <span>Кабинет</span>
              </button>
              {accountDropdownOpen && (
                <div className="figma-header__dropdown-menu" role="menu">
                  <Link role="menuitem" to="/account/properties" onClick={() => setAccountDropdownOpen(false)}>
                    Мои объекты
                  </Link>
                  <Link role="menuitem" to="/account/favorites" onClick={() => setAccountDropdownOpen(false)}>
                    Избранное
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="header-logout-btn"
                    onClick={async () => {
                      setAccountDropdownOpen(false)
                      await logout()
                      navigate('/')
                    }}
                  >
                    Выйти
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              className="header-action header-action--dark figma-header__cabinet-btn"
              to="/auth/login"
              data-testid="header-login-link"
            >
              <span className="figma-header__cabinet-icon" aria-hidden="true">◔</span>
              <span>Войти</span>
            </Link>
          )}

          {/* Mobile hamburger button */}
          <button
            className="figma-header__burger"
            type="button"
            aria-label="Меню навигации"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {/* Mobile Drawer (Figma mob_* frame integrated navigation) */}
      {mobileMenuOpen && (
        <div className="figma-header__mobile-drawer" role="dialog" aria-label="Мобильное меню">
          <div className="figma-header__mobile-links">
            <Link to="/newconstructions" onClick={() => setMobileMenuOpen(false)}>Новостройки</Link>
            <Link to="/secondary" onClick={() => setMobileMenuOpen(false)}>Вторичка</Link>
            <Link to="/newconstructions" onClick={() => setMobileMenuOpen(false)}>Проекты</Link>
            <Link to="/rent" onClick={() => setMobileMenuOpen(false)}>Аренда</Link>
            <Link to="/secondary?propertyType=commercial" onClick={() => setMobileMenuOpen(false)}>Коммерция</Link>
            <Link to="/requests" onClick={() => setMobileMenuOpen(false)}>Запросы</Link>
            <Link to="/banks" onClick={() => setMobileMenuOpen(false)}>Банки</Link>
            <hr className="figma-header__drawer-divider" />
            {/* В мобильном меню входа не было вовсе: попасть в кабинет с
                телефона можно было только по прямому адресу. */}
            {isAuthenticated ? (
              <>
                <Link to="/account/properties" onClick={() => setMobileMenuOpen(false)}>Мои объекты</Link>
                <Link to="/account/favorites" onClick={() => setMobileMenuOpen(false)}>Избранное</Link>
                <button
                  type="button"
                  className="figma-header__mobile-logout"
                  onClick={async () => {
                    setMobileMenuOpen(false)
                    await logout()
                    navigate('/')
                  }}
                >
                  Выйти
                </button>
              </>
            ) : (
              <Link to="/auth/login" onClick={() => setMobileMenuOpen(false)}>Войти</Link>
            )}
            <Link to="/publish" className="figma-header__mobile-cta" onClick={() => setMobileMenuOpen(false)}>
              + Разместить объект
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
