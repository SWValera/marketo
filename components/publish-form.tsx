"use client";

import { Check, ChevronLeft, ChevronRight, ImagePlus } from "lucide-react";
import { useState } from "react";
import { categories } from "@/lib/mock-data";

const steps = ["Категория", "Описание", "Фотографии", "Контакты"];

export function PublishForm() {
  const [step, setStep] = useState(0);
  const [complete, setComplete] = useState(false);

  if (complete) {
    return <div className="publish-success"><span><Check size={30} /></span><h2>Объявление подготовлено</h2><p>Это тестовый режим. После подключения Supabase объявление будет отправляться на модерацию.</p><button type="button" onClick={() => { setComplete(false); setStep(0); }}>Создать ещё одно</button></div>;
  }

  return (
    <div className="publish-card">
      <ol className="publish-steps">
        {steps.map((label, index) => <li className={index === step ? "is-current" : index < step ? "is-done" : ""} key={label}><span>{index < step ? <Check size={15} /> : index + 1}</span><small>{label}</small></li>)}
      </ol>

      {step === 0 && <div className="publish-panel"><h2>Выберите категорию</h2><label>Категория<select defaultValue=""><option value="" disabled>Выберите категорию</option>{categories.map((item) => <option key={item.slug}>{item.name}</option>)}</select></label><label>Город<select defaultValue="Алматы"><option>Алматы</option><option>Астана</option><option>Шымкент</option><option>Караганда</option></select></label></div>}
      {step === 1 && <div className="publish-panel"><h2>Расскажите о товаре</h2><label>Название<input placeholder="Например, Toyota Camry 2020" maxLength={70} /></label><label>Цена, ₸<input inputMode="numeric" placeholder="8 500 000" /></label><label>Описание<textarea rows={6} placeholder="Состояние, характеристики и важные детали" /></label></div>}
      {step === 2 && <div className="publish-panel"><h2>Добавьте фотографии</h2><label className="photo-upload"><ImagePlus size={32} /><strong>Выбрать фотографии</strong><small>До 12 файлов JPG, PNG или WebP</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple /></label></div>}
      {step === 3 && <div className="publish-panel"><h2>Контакты продавца</h2><label>Имя<input defaultValue="Айдос" /></label><label>Телефон<input inputMode="tel" placeholder="+7 700 000 00 00" /></label><label className="check-row"><input type="checkbox" defaultChecked /> Разрешить сообщения в чате Marketo</label></div>}

      <div className="publish-controls">
        <button type="button" className="secondary-control" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ChevronLeft size={18} />Назад</button>
        {step < steps.length - 1 ? <button type="button" className="primary-control" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>Далее<ChevronRight size={18} /></button> : <button type="button" className="primary-control" onClick={() => setComplete(true)}>Отправить на модерацию<Check size={18} /></button>}
      </div>
    </div>
  );
}
