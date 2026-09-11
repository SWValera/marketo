"use client";

/* eslint-disable @next/next/no-img-element */
import {useRef, useState} from 'react';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import {useI18n} from '@/components/i18n-provider';
import {galleryIndex, galleryTarget} from '@/lib/media/gallery-position';

export function ListingGallery({images, title}: {images: readonly string[]; title: string}) {
  const {t} = useI18n();
  const track = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  const current = galleryTarget(position, images.length);
  function select(index: number) {
    const element = track.current;
    if (!element || !element.clientWidth) return;
    const next = galleryTarget(index, images.length);
    element.scrollTo({left: element.clientWidth * next, behavior: 'instant'});
    setPosition(next);
  }
  if (!images.length) return null;
  return <div className="listing-gallery" role="region" aria-label={t('listing.gallery')}>
    <div className="gallery-track" ref={track} tabIndex={images.length > 1 ? 0 : undefined}
      aria-label={t('listing.gallery')}
      onScroll={event => setPosition(galleryIndex(event.currentTarget.scrollLeft, event.currentTarget.clientWidth, images.length))}
      onKeyDown={event => {
        if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        select(event.key === 'Home' ? 0 : event.key === 'End' ? images.length - 1 : current + (event.key === 'ArrowRight' ? 1 : -1));
      }}>
      {images.map((url, index) => <figure className="gallery-main gallery-slide" key={url}
        aria-label={t('listing.photoNumber', {current:index + 1, total:images.length})}>
        <img src={url} alt={`${title} — ${t('listing.photoNumber', {current:index + 1, total:images.length})}`}
          loading={index === 0 ? 'eager' : 'lazy'} decoding="async" draggable={false} />
      </figure>)}
    </div>
    {images.length > 1 ? <>
      <div className="gallery-controls">
        <button type="button" onClick={() => select(current - 1)} disabled={current === 0} aria-label={t('listing.previousPhoto')}><ChevronLeft size={22} /></button>
        <span aria-live="polite" aria-atomic="true">{t('listing.photoNumber', {current:current + 1, total:images.length})}</span>
        <button type="button" onClick={() => select(current + 1)} disabled={current === images.length - 1} aria-label={t('listing.nextPhoto')}><ChevronRight size={22} /></button>
      </div>
      <div className="gallery-selectors" role="group" aria-label={t('listing.gallery')}>
        {images.map((url,index) => <button type="button" key={url} onClick={() => select(index)} aria-pressed={index === current}
          aria-label={t('listing.photoNumber', {current:index + 1, total:images.length})}>{index + 1}</button>)}
      </div>
    </> : null}
  </div>;
}
