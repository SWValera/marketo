import Link from "next/link";
import { Heart, Home, MessageCircle, Plus, UserRound } from "lucide-react";

export function MobileNav() {
  return (
    <nav className="mobile-bottom-nav" aria-label="Основная мобильная навигация">
      <Link href="/"><Home size={21} /><span>Главная</span></Link>
      <Link href="/favorites"><Heart size={21} /><span>Избранное</span></Link>
      <Link href="/publish" className="mobile-publish"><Plus size={25} /><span>Подать</span></Link>
      <Link href="/messages"><MessageCircle size={21} /><span>Чаты</span></Link>
      <Link href="/profile"><UserRound size={21} /><span>Профиль</span></Link>
    </nav>
  );
}
