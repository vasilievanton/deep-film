import { useEffect } from 'react';
import { startFilm } from '@/lib/film/engine';

/** Запускает движок сцен в браузере. Ничего не рисует: вся разметка приходит статичной. */
export default function FilmRuntime() {
  useEffect(() => startFilm(), []);
  return null;
}
