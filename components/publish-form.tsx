/* eslint-disable @next/next/no-img-element */
"use client";

import {
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ImagePlus,
  ShieldCheck,
  Smartphone,
  Tag,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LocationPicker, useStoredLocation } from "@/components/location-picker";
import { PageHeader } from "@/components/page-header";
import { categoryConfigs, getCategoryBySlug } from "@/lib/catalog-config";

const steps = ["Категория", "Описание", "Фотографии", "Контакты"];

type PhotoPreview = { name: string; url: string };

export function PublishForm() {
  const [step, setStep] = useState(0);
  const [complete, setComplete] = useState(false);
  const [categorySlug, setCategorySlug] = useState("");
  const storedLocation = useStoredLocation();
  const [cityOverride, setCityOverride] = useState<string | null>(null);
  const cityId = cityOverride ?? (storedLocation === "all" ? "almaty" : storedLocation);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [attributes, setAttributes] = useState<Record<string, string | boolean>>({});
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const photosRef = useRef<PhotoPreview[]>([]);
  const [error, setError] = useState("");

  const category = getCategoryBySlug(categorySlug);
  const pageTitle = complete ? "Объявление отправлено" : `Подать объявление · ${steps[step]}`;

  useEffect(() => { photosRef.current = photos; }, [photos]);
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  const summary = useMemo(() => [
    category?.name.ru,
    title,
    price ? `${Number(price).toLocaleString("ru-RU")} ₸` : "",
  ].filter(Boolean), [category?.name.ru, price, title]);

  function validateAndContinue() {
    setError("");
    if (step === 0 && !categorySlug) {
      setError("Выберите категорию объявления.");
      return;
    }
    if (step === 1 && (!title.trim() || !description.trim() || !price)) {
      setError("Заполните название, цену и описание.");
      return;
    }
    setStep((value) => Math.min(steps.length - 1, value + 1));
  }

  function previousStep() {
    setError("");
    setStep((value) => Math.max(0, value - 1));
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).slice(0, Math.max(0, 12 - photos.length)).map((file) => ({ name: file.name, url: URL.createObjectURL(file) }));
    setPhotos((current) => [...current, ...next]);
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      URL.revokeObjectURL(current[index].url);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  function movePhoto(index: number, direction: -1 | 1) {
    setPhotos((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function reset() {
    photos.forEach((photo) => URL.revokeObjectURL(photo.url));
    setPhotos([]);
    setComplete(false);
    setStep(0);
    setCategorySlug("");
    setCityOverride(null);
    setTitle("");
    setDescription("");
    setPrice("");
    setAttributes({});
    setError("");
  }

  return (
    <>
      <PageHeader
        fallback="/profile"
        eyebrow="Новое объявление"
        title={pageTitle}
        description={complete ? "Публикация сохранена и ожидает проверки." : `Шаг ${step + 1} из ${steps.length}. Перед отправкой вы сможете проверить данные.`}
        onBack={step > 0 && !complete ? previousStep : undefined}
      />

      {complete ? (
        <div className="publish-success">
          <span><Check size={30} /></span>
          <h2>Объявление отправлено на модерацию</h2>
          <p>Мы проверим публикацию и сообщим о результате в уведомлениях. Обычно это занимает несколько минут.</p>
          <div className="publish-summary">{summary.map((item) => <span key={item}>{item}</span>)}</div>
          <button type="button" onClick={reset}>Создать ещё одно</button>
        </div>
      ) : (
        <div className="publish-card">
          <div className="publish-progress-mobile">
            <div><strong>Шаг {step + 1} из {steps.length}</strong><span>{steps[step]}</span></div>
            <div><span style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
          </div>
          <ol className="publish-steps" aria-label="Этапы публикации">
            {steps.map((label, index) => (
              <li className={index === step ? "is-current" : index < step ? "is-done" : ""} key={label}>
                <span>{index < step ? <Check size={15} /> : index + 1}</span><small>{label}</small>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <div className="publish-panel">
              <div className="panel-heading"><span><Tag size={22} /></span><div><h2>Что вы размещаете?</h2><p>Категория определит поля, подсказки и фильтры объявления.</p></div></div>
              <div className="form-grid">
                <label className="form-field form-field-wide">
                  <span>Категория <b>*</b></span>
                  <div className="select-wrap"><select value={categorySlug} onChange={(event) => { setCategorySlug(event.target.value); setAttributes({}); setError(""); }}><option value="" disabled>Выберите категорию</option>{categoryConfigs.map((item) => <option value={item.slug} key={item.slug}>{item.name.ru}</option>)}</select><ChevronDown size={18} /></div>
                  <small>У каждой категории — свои характеристики и фильтры.</small>
                </label>
                <div className="form-field form-field-wide"><span>Город или населённый пункт <b>*</b></span><LocationPicker value={cityId} onChange={setCityOverride} allowAll={false} /><small>Поиск доступен по городам всех регионов Казахстана.</small></div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="publish-panel">
              <div className="panel-heading"><span><Tag size={22} /></span><div><h2>{category ? `Детали: ${category.name.ru}` : "Расскажите подробнее"}</h2><p>{category?.descriptionHint.ru ?? "Добавьте понятное название и честное описание."}</p></div></div>
              <div className="form-grid">
                <label className="form-field form-field-wide"><span>Название <b>*</b></span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={category?.titlePlaceholder.ru ?? "Кратко опишите предложение"} maxLength={70} /><small>{title.length}/70 · заголовок будет виден в каталоге.</small></label>
                <label className="form-field"><span>{categorySlug === "jobs" ? "Зарплата, ₸" : categorySlug === "services" ? "Цена от, ₸" : "Цена, ₸"} <b>*</b></span><input inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value.replace(/\D/g, ""))} placeholder="150 000" /></label>
                {category?.filters.map((filter) => filter.type === "select" ? (
                  <label className="form-field" key={filter.id}><span>{filter.label.ru}</span><div className="select-wrap"><select value={String(attributes[filter.id] ?? "")} onChange={(event) => setAttributes((current) => ({ ...current, [filter.id]: event.target.value }))}><option value="">Выберите значение</option>{filter.options?.map((option) => <option value={option.value} key={option.value}>{option.label.ru}</option>)}</select><ChevronDown size={18} /></div></label>
                ) : (
                  <label className="option-row form-field-wide" key={filter.id}><input type="checkbox" checked={Boolean(attributes[filter.id])} onChange={(event) => setAttributes((current) => ({ ...current, [filter.id]: event.target.checked }))} /><span><strong>{filter.label.ru}</strong><small>Отметьте, если это применимо к вашему объявлению.</small></span></label>
                ))}
                <label className="form-field form-field-wide"><span>Описание <b>*</b></span><textarea rows={7} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={category?.descriptionHint.ru ?? "Опишите предложение и важные детали"} /><small>Не указывайте телефон в описании — для него есть отдельный шаг.</small></label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="publish-panel">
              <div className="panel-heading"><span><Camera size={22} /></span><div><h2>Добавьте фотографии</h2><p>Первое фото станет обложкой. Фотографии можно поменять местами.</p></div></div>
              <label className="photo-upload"><span className="photo-upload-icon"><ImagePlus size={30} /></span><strong>Выбрать фотографии</strong><small>До 12 файлов · JPG, PNG или WebP · не более 10 МБ</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => addPhotos(event.target.files)} /></label>
              {photos.length > 0 && <div className="photo-preview-grid">{photos.map((photo, index) => <article key={`${photo.name}-${index}`}><img src={photo.url} alt={`Предпросмотр ${index + 1}`} />{index === 0 && <b>Главное фото</b>}<div><button type="button" disabled={index === 0} onClick={() => movePhoto(index, -1)} aria-label="Переместить фото влево"><ChevronLeft size={16} /></button><GripVertical size={16} /><button type="button" disabled={index === photos.length - 1} onClick={() => movePhoto(index, 1)} aria-label="Переместить фото вправо"><ChevronRight size={16} /></button><button type="button" className="remove-photo" onClick={() => removePhoto(index)} aria-label="Удалить фото"><Trash2 size={16} /></button></div></article>)}</div>}
              <div className="photo-tips"><ShieldCheck size={19} /><div><strong>Совет для хороших фотографий</strong><p>Снимайте при дневном свете, покажите объект с разных сторон и отдельно сфотографируйте недостатки.</p></div></div>
            </div>
          )}

          {step === 3 && (
            <div className="publish-panel">
              <div className="panel-heading"><span><Smartphone size={22} /></span><div><h2>Как с вами связаться?</h2><p>Проверьте контакты перед отправкой объявления.</p></div></div>
              <div className="form-grid">
                <label className="form-field"><span>Имя <b>*</b></span><input defaultValue="Айдос" autoComplete="name" /></label>
                <label className="form-field"><span>Телефон <b>*</b></span><input inputMode="tel" defaultValue="+7 700 123 45 67" autoComplete="tel" /></label>
                <label className="option-row form-field-wide"><input type="checkbox" defaultChecked /><span><strong>Разрешить сообщения в Marketo</strong><small>Покупатели смогут написать вам, не раскрывая номер телефона.</small></span></label>
                <label className="option-row form-field-wide"><input type="checkbox" /><span><strong>Звонки только с 09:00 до 21:00</strong><small>Покажем покупателям удобное время для связи.</small></span></label>
              </div>
              <div className="publish-review"><strong>Перед отправкой</strong><p>{summary.length ? summary.join(" · ") : "Проверьте категорию, описание и контакты."}</p></div>
            </div>
          )}

          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="publish-controls">
            <button type="button" className="secondary-control" disabled={step === 0} onClick={previousStep}><ChevronLeft size={18} />Назад</button>
            {step < steps.length - 1 ? <button type="button" className="primary-control" onClick={validateAndContinue}>Далее<ChevronRight size={18} /></button> : <button type="button" className="primary-control" onClick={() => setComplete(true)}>Отправить на модерацию<Check size={18} /></button>}
          </div>
        </div>
      )}
    </>
  );
}
