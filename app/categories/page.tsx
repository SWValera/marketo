import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { PageHeader } from "@/components/page-header";
import { categoryTree } from "@/lib/catalog-config";

export const metadata: Metadata = { title: "Все категории", description: "Полный каталог категорий Marketo Казахстан.", alternates: { canonical: "/categories" } };

export default function CategoriesPage() {
  return <><Header /><main className="page-shell subpage-main"><PageHeader fallback="/" eyebrow="Каталог Marketo" title="Все категории" description="Выберите точный раздел — Marketo покажет подходящие поля и фильтры." /><div className="category-directory">{categoryTree.map((category) => <section className="category-directory-group" key={category.slug}><Link className="category-directory-title" href={`/category/${category.slug}`}><span className={`category-icon tone-${category.tone}`}><CategoryIcon name={category.icon} /></span><strong>{category.name.ru}</strong><ChevronRight size={19} /></Link><div>{category.children?.map((child) => <Link href={`/category/${child.slug}`} key={child.slug}>{child.name.ru}</Link>)}</div></section>)}</div></main><MobileNav /></>;
}
