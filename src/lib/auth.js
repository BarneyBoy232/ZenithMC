// auth.js — single Abstrak gate for the whole site (sign-in + admin check).
import { abstrak } from 'abstrak';

export const PK = 'pk_live_1df6d7f6ba3b4fc8';
export const ADMIN_EMAIL = 'ethan.barnacoat@gmail.com';
export const gate = abstrak(PK);
