import { Link } from 'react-router-dom'

/**
 * MKT-SCR-027: страница «не найдено».
 *
 * Отдельного фрейма в Figma нет — это зафиксированный Figma gap
 * (`marketplace-screen-build-spec.md` §2). Решение владельца от 04.09.2026:
 * «то, что не нарисовано, возьми стилистику и в том же стиле сделай». Поэтому
 * экран собран из уже подтверждённых токенов UI kit (`40:4517`), без новых
 * цветов, шрифтов и композиционных приёмов.
 *
 * До этого маршрут `*` молча отдавал главную: человек по битой ссылке видел
 * рабочую страницу и не понимал, что адрес неверный, а поисковик получал 200 на
 * несуществующий URL.
 */
export function NotFoundPage() {
  return (
    <section className="not-found-page" aria-labelledby="not-found-title">
      <p className="not-found-page__code" aria-hidden="true">
        404
      </p>
      <h1 id="not-found-title" className="not-found-page__title">
        Такой страницы нет
      </h1>
      <p className="not-found-page__text">
        Возможно, объект сняли с публикации или в адресе опечатка.
      </p>
      <div className="not-found-page__actions">
        <Link to="/newconstructions" className="not-found-page__btn not-found-page__btn--primary">
          Смотреть новостройки
        </Link>
        <Link to="/" className="not-found-page__btn">
          На главную
        </Link>
      </div>
    </section>
  )
}
