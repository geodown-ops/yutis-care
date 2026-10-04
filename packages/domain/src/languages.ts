/* Languages of the employee portal (員工端語言). Staff back offices are Traditional Chinese only. */

export const EMPLOYEE_LANGS = ['zh', 'en', 'ja', 'vi', 'th'] as const;
export type EmployeeLang = (typeof EMPLOYEE_LANGS)[number];

export const isEmployeeLang = (lang: string): lang is EmployeeLang => (EMPLOYEE_LANGS as readonly string[]).includes(lang);
