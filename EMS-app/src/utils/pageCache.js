// ─── Cache mémoire partagé entre les pages ────────────────────────────────────
// Quand l'utilisateur navigue, chaque page repartait de zéro ("Waiting for
// data...") le temps que ses fetchs reviennent. Ce cache garde les DERNIÈRES
// données affichées : la page se rouvre instantanément avec les valeurs
// précédentes, puis se met à jour dès que les données fraîches arrivent.
const cache = new Map();

export const getCached = (key, fallback) =>
  cache.has(key) ? cache.get(key) : fallback;

export const setCached = (key, value) => {
  cache.set(key, value);
  return value;
};
