/* Common Types used across multiple modules
so we dont repeat ourselves
*/

// ISO Date String  gives a date in standard format
export type ISODateString = string; // e.g. "2023-08-15T13:45:30Z"

// Pagination input for listing endpoints
export type PaginationInput<SortField extends string = string> = {
	limit?: number; // number of items to return
	offset?: number; // number of items to skip
	sortBy?: SortField; // field to sort by
	sortOrder?: "asc" | "desc"; // optional sort direction
};

// Pagination output for listing endpoints
export type PaginationOutput<T> = {
	total: number; // total number of items available
	items: T[]; // array of items returned
	pageCount?: number; // total number of pages
};
