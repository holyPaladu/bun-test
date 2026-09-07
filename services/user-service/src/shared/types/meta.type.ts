export interface Meta {
  ip: string | null
  userAgent: string | null
}

export type Pagination = {
  page: number
  perPage: number
}
export type PaginationInside = {
  limit: number
  offset: number
}