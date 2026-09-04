import { Link } from 'react-router-dom'

/**
 * Footer Component (Figma Node: 3067:73634 / 'footer 1')
 * Dimensions: 1920x640 (desktop), integrated adaptive (mobile)
 * 5 Columns: Новостройки, Вторичка, Проекты, Аренда, Коммерция
 * 2nd tier: Полезное, Банки, Услуги, Поддержка, Документы
 * Bottom: Divider + Copyright
 */
export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="site-footer figma-footer" role="contentinfo">
      <div className="figma-footer__inner">
        {/* Top block: Brand info + 5 Column Link Matrix (Figma 3067:73635 [1628x356]) */}
        <div className="figma-footer__top">
          {/* Brand info (Figma 3067:73636 [354x229]) */}
          <div className="figma-footer__brand">
            <Link to="/" className="site-footer__wordmark figma-footer__logo" aria-label="BAZA, главная страница">
              BAZA<span className="figma-footer__logo-dot">.sale</span>
            </Link>
            <p className="figma-footer__tagline">
              Экосистема для риелторов нового поколения, покупка, продажа, аренда недвижимости
            </p>
            {/* Social links (Figma 3067:73643 [211x40]) */}
            <div className="figma-footer__socials" aria-label="Мы в социальных сетях">
              <a href="https://t.me/baza_sale" target="_blank" rel="noopener noreferrer" className="figma-footer__social-btn" aria-label="Telegram">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.05-.2-.06-.05-.16-.03-.23-.02-.1.02-1.63 1.04-4.61 3.05-.44.3-.83.45-1.19.44-.39-.01-1.15-.22-1.71-.4-.69-.22-1.24-.34-1.19-.72.03-.2.3-.41.82-.62 3.2-1.39 5.34-2.31 6.42-2.75 3.05-1.27 3.69-1.49 4.1-1.5.09 0 .29.02.42.13.11.09.14.22.15.31-.01.07.01.21 0 .28z"/></svg>
              </a>
              <a href="https://wa.me/" target="_blank" rel="noopener noreferrer" className="figma-footer__social-btn" aria-label="WhatsApp">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.66c-.19-.09-1.11-.55-1.28-.61-.17-.06-.3-.09-.42.09-.13.19-.48.61-.59.74-.11.13-.23.14-.42.05-.19-.09-.79-.29-1.51-.93-.56-.5-1-.1.12-1.2-.09-.1-.01-.15.08-.24.08-.09.19-.22.28-.33.09-.11.13-.19.19-.31.06-.13.03-.24-.02-.33-.04-.09-.42-1.02-.58-1.4-.15-.37-.31-.32-.42-.33h-.36c-.13 0-.33.05-.5.24-.17.19-.66.65-.66 1.58 0 .93.68 1.83.77 1.96.09.13 1.33 2.04 3.23 2.86.45.19.8.31 1.08.4.46.14.87.12 1.2.07.36-.05 1.11-.45 1.27-.89.16-.44.16-.81.11-.89-.04-.08-.17-.13-.36-.22z"/></svg>
              </a>
              <a href="https://instagram.com/" target="_blank" rel="noopener noreferrer" className="figma-footer__social-btn" aria-label="Instagram">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              </a>
            </div>
          </div>

          {/* Links Grid: 5 columns (Figma 3067:73659 [1226x356]) */}
          <div className="figma-footer__nav-grid">
            {/* Column 1: Новостройки (3067:73661) */}
            <div className="figma-footer__col">
              <h3 className="figma-footer__col-title">Новостройки</h3>
              <ul className="figma-footer__link-list">
                <li><Link to="/newconstructions">Жилые комплексы</Link></li>
                <li><Link to="/?type=villas">Виллы</Link></li>
                <li><Link to="/?type=townhouses">Таунхаусы</Link></li>
                <li><Link to="/?promo=discounts">Акции и скидки</Link></li>
              </ul>
            </div>

            {/* Column 2: Вторичка (3067:73668) */}
            <div className="figma-footer__col">
              <h3 className="figma-footer__col-title">Вторичка</h3>
              <ul className="figma-footer__link-list">
                <li><Link to="/secondary">Квартиры</Link></li>
                <li><Link to="/secondary?propertyType=house">Дома и коттеджи</Link></li>
                <li><Link to="/secondary?propertyType=land">Земельные участки</Link></li>
                <li><Link to="/secondary?urgent=true">Срочная продажа</Link></li>
              </ul>
            </div>

            {/* Column 3: Проекты (3067:73675) */}
            <div className="figma-footer__col">
              <h3 className="figma-footer__col-title">Проекты</h3>
              <ul className="figma-footer__link-list">
                <li><Link to="/newconstructions">На этапе проекта</Link></li>
                <li><Link to="/newconstructions?stage=construction">Строящиеся</Link></li>
                <li><Link to="/newconstructions?stage=ready">Готовые <span className="figma-footer__badge">New</span></Link></li>
                <li><Link to="/newconstructions?featured=true">Интересное</Link></li>
              </ul>
            </div>

            {/* Column 4: Аренда (3067:73686) */}
            <div className="figma-footer__col">
              <h3 className="figma-footer__col-title">Аренда</h3>
              <ul className="figma-footer__link-list">
                <li><Link to="/rent">Долгосрочная</Link></li>
                <li><Link to="/rent?dealType=rent_short">Посуточная</Link></li>
                <li><Link to="/rent?popular=true">Популярное</Link></li>
              </ul>
            </div>

            {/* Column 5: Коммерция (3067:73692) */}
            <div className="figma-footer__col">
              <h3 className="figma-footer__col-title">Коммерция</h3>
              <ul className="figma-footer__link-list">
                <li><Link to="/secondary?propertyType=commercial">Продажа</Link></li>
                <li><Link to="/rent?propertyType=commercial">Аренда</Link></li>
                <li><Link to="/secondary?propertyType=commercial&hot=true">Горячие предложения</Link></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Secondary Tier: Services & Support (Figma 3067:73698 [1226x168]) */}
        <div className="figma-footer__secondary">
          <div className="figma-footer__sub-col">
            <h4 className="figma-footer__sub-title">Полезное</h4>
            <div className="figma-footer__sub-links">
              <Link to="/realtors">Риелторы</Link>
              <Link to="/publish">Разместить объект</Link>
              <Link to="/requests">Запросы</Link>
            </div>
          </div>
          <div className="figma-footer__sub-col">
            <h4 className="figma-footer__sub-title">Сервисы</h4>
            <div className="figma-footer__sub-links">
              <Link to="/banks">Банки и ипотека</Link>
              <Link to="/calculator">Кредитный калькулятор</Link>
              <Link to="/analytics">Аналитика рынка</Link>
            </div>
          </div>
          <div className="figma-footer__sub-col">
            <h4 className="figma-footer__sub-title">Поддержка</h4>
            <div className="figma-footer__sub-links">
              <Link to="/faq">Справочный центр</Link>
              <Link to="/contacts">Контакты</Link>
              <Link to="/support">Написать нам</Link>
            </div>
          </div>
          <div className="figma-footer__sub-col">
            <h4 className="figma-footer__sub-title">Правовая информация</h4>
            <div className="figma-footer__sub-links">
              <Link to="/privacy">Политика конфиденциальности</Link>
              <Link to="/terms">Пользовательское соглашение</Link>
              <Link to="/offer">Оферта</Link>
            </div>
          </div>
        </div>

        {/* Bottom Sub-bar: Copyright (Figma 3067:73735 [1720x44]) */}
        <div className="figma-footer__bottom">
          <hr className="figma-footer__bottom-line" />
          <div className="figma-footer__bottom-content">
            <p className="site-footer__copyright figma-footer__copyright">
              © {currentYear} Компания «BAZA SALE». Все права защищены. При использовании материалов гиперссылка обязательна.
            </p>
            <p className="figma-footer__disclaimer">
              Не является публичной офертой. Цены и планировки актуализируются из реестра.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
