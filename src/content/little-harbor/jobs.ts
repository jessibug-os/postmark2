import { CAFE_SHIFT } from './jobs/cafe';
export const HARBOR_JOBS = [CAFE_SHIFT] as const;
export const harborJob = (id: string) => HARBOR_JOBS.find(job => job.id === id);
