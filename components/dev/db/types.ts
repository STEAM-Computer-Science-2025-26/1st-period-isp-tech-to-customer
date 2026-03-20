export type DbTable = { name: string; comment?: string | null };

export type DbColumn = {
	name: string;
	type: string;
	nullable?: boolean;
	defaultValue?: string | null;
	isPrimaryKey?: boolean;
	comment?: string | null;
};
