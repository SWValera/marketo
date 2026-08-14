export type ChatPreview = {
  id: string;
  name: string;
  initials: string;
  tone?: string;
  listingTitle: string;
  listingHref: string;
  listingPrice: string;
  listingLocation: string;
  lastMessage: string;
  time: string;
  unread?: number;
};

export const chats: ChatPreview[] = [
  { id: "nurlan", name: "Нурлан", initials: "Н", listingTitle: "Toyota Camry 2020", listingHref: "/listing/mk-10345-toyota-camry-2020", listingPrice: "8 500 000 ₸", listingLocation: "Алматы", lastMessage: "Можно посмотреть сегодня вечером?", time: "10:42", unread: 2 },
  { id: "marina", name: "Марина", initials: "М", tone: "tone-purple", listingTitle: "2-комнатная квартира, 56 м²", listingHref: "/listing/mk-10355-dvuhkomnatnaya-kvartira-astana", listingPrice: "28 500 000 ₸", listingLocation: "Астана", lastMessage: "Спасибо, я подумаю", time: "Вчера" },
  { id: "ruslan", name: "Руслан", initials: "Р", tone: "tone-blue", listingTitle: "iPhone 13 128GB", listingHref: "/listing/mk-10347-iphone-13-128gb", listingPrice: "350 000 ₸", listingLocation: "Алматы", lastMessage: "Фото получил, благодарю", time: "12 авг." },
];

export function getChat(id: string) {
  return chats.find((chat) => chat.id === id);
}
