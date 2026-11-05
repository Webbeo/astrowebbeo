import { getPermalink, getHomePermalink } from './utils/permalinks';
import c from './data/content.json';

const b = c.business;

export const headerData = {
  links: [
    { text: 'Home', href: getHomePermalink() },
    { text: 'Services', href: getPermalink('/services') },
    { text: 'About', href: getPermalink('/about') },
    { text: 'Contact', href: getPermalink('/contact') },
  ],
  actions: [{ text: `Call ${b.phone}`, href: `tel:${b.phone}` }],
};

export const footerData = {
  links: [
    {
      title: 'Services',
      links: c.services.map((s) => ({ text: s.title, href: getPermalink(`/services/${s.slug}`) })),
    },
    {
      title: 'Company',
      links: [
        { text: 'About', href: getPermalink('/about') },
        { text: 'Contact', href: getPermalink('/contact') },
      ],
    },
  ],
  secondaryLinks: [],
  socialLinks: [],
  footNote: `&copy; ${new Date().getFullYear()} ${b.name}. All rights reserved.`,
};
