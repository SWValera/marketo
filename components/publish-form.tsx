"use client";

import { Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ImagePlus, MapPin, ShieldCheck, Smartphone, Tag } from "lucide-react";
import { useState } from "react";
import { categories } from "@/lib/mock-data";

const steps = ["Категория", "Описание", "Фотографии", "Контакты"];

export function PublishForm() {
  const [step, setStep] = useState(0);
  const [complete, setComplete] = useState(false);

  if (complete) {
    return <div className="publish-success"><span><Check size={30} /></span><h2>Объявление отправлено на модерацию</h2><p>Мы проверим публикацию и сообщим о результате в уведомлениях. Обычно это занимает несколько минут.</p><button type="button" onClick={() => { setComplete(false); setStep(0); }}>Создать ещё одно</button></div>;
  }

  return (
    <div className="publish-card">
      <div className="publish-progress-mobile">
        <div><strong>Шаг {step + 1} из {steps.length}</strong><span>{steps[step]}</span></div>
        <div><span style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
      </div>
      <ol className="publish-steps">
        {steps.map((label, index) => <li className={index === step ? "is-current" : index < step ? "is-done" : ""} key={label}><span>{index < step ? <Check size={15} /> : index + 1}</span><small>{label}</small></li>)}
      </ol>

      {step === 0 && <div className="publish-panel">
        <div className="panel-heading"><span><Tag size={22} /></span><div><h2>Что вы продаёте?</h2><p>Выберите категорию и город — так покупатели быстрее найдут объявление.</p></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Категория <b>*</b></span><div className="select-wrap"><select defaultValue=""><option value="" disabled>Выберите категорию</option>{categories.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select><ChevronDown size={18} /></div><small>Позже можно будет выбрать подкатегорию и характеристики.</small></label>
          <label className="form-field"><span>Город <b>*</b></span><div className="select-wrap"><MapPin size={18} className="field-leading-icon" /><select className="has-leading-icon" defaultValue="Алматы"><option>Алматы</option><option>Астана</option><option>Шымкент</option><option>Караганда</option></select><ChevronDown size={18} /></div><small>Укажите город, где находится товар.</small></label>
        </div>
      </div>}
      {step === 1 && <div className="publish-panel">
        <div className="panel-heading"><span><Tag size={22} /></span><div><h2>Расскажите о товаре</h2><p>Честное и подробное описание помогает продать быстрее.</p></div></div>
        <div className="form-grid">
          <label className="form-field form-field-wide"><span>Название <b>*</b></span><input placeholder="Например, Toyota Camry 2020" maxLength={70} /><small>До 70 символов. Укажите главное: марку, модель и состояние.</small></label>
          <label className="form-field"><span>Цена, ₸ <b>*</b></span><input inputMode="numeric" placeholder="8 500 000" /></label>
          <label className="form-field"><span>Состояние</span><div className="select-wrap"><select defaultValue="used"><option value="used">Б/у, отличное</option><option value="new">Новое</option><option value="parts">На запчасти</option></select><ChevronDown size={18} /></div></label>
          <label className="form-field form-field-wide"><span>Описание <b>*</b></span><textarea rows={7} placeholder="Опишите состояние, характеристики, комплектацию и важные детали" /><small>Не указывайте телефон в описании — для него есть отдельное поле.</small></label>
        </div>
      </div>}
      {step === 2 && <div className="publish-panel">
        <div className="panel-heading"><span><Camera size={22} /></span><div><h2>Добавьте фотографии</h2><p>Первое фото станет обложкой объявления.</p></div></div>
        <label className="photo-upload"><span className="photo-upload-icon"><ImagePlus size={30} /></span><strong>Нажмите, чтобы выбрать фотографии</strong><small>До 12 файлов · JPG, PNG или WebP · не более 10 МБ</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple /></label>
        <div className="photo-tips"><ShieldCheck size={19} /><div><strong>Совет для хороших фотографий</strong><p>Снимайте при дневном свете, покажите товар с разных сторон и отдельно сфотографируйте недостатки.</p></div></div>
      </div>}
      {step === 3 && <div className="publish-panel">
        <div className="panel-heading"><span><Smartphone size={22} /></span><div><h2>Как с вами связаться?</h2><p>Проверьте контакты перед отправкой объявления.</p></div></div>
        <div className="form-grid">
          <label className="form-field"><span>Имя <b>*</b></span><input defaultValue="Айдос" /></label>
          <label className="form-field"><span>Телефон <b>*</b></span><input inputMode="tel" defaultValue="+7 700 123 45 67" /></label>
          <label className="option-row form-field-wide"><input type="checkbox" defaultChecked /><span><strong>Разрешить сообщения в Marketo</strong><small>Покупатели смогут написать вам, не раскрывая номер телефона.</small></span></label>
          <label className="option-row form-field-wide"><input type="checkbox" /><span><strong>Принимать звонки только с 09:00 до 21:00</strong><small>Покажем покупателям удобное время для связи.</small></span></label>
        </div>
      </div>}

      <div className="publish-controls">
        <button type="button" className="secondary-control" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ChevronLeft size={18} />Назад</button>
        {step < steps.length - 1 ? <button type="button" className="primary-control" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>Далее<ChevronRight size={18} /></button> : <button type="button" className="primary-control" onClick={() => setComplete(true)}>Отправить на модерацию<Check size={18} /></button>}
      </div>
    </div>
  );
}
