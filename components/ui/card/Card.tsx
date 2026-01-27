"use client";

import type { CardProps } from "./types";
import { BarChartCardInner } from "./BarChartCard";
import { DataCardInner } from "./DataCard";
import { KpiCardInner } from "./KpiCard";
import { LineGraphCardInner } from "./LineGraphCard";
import { ListCardInner } from "./ListCard";
import { TableCardInner } from "./TableCard";

export function Card(props: CardProps) {
	if (props.type === "kpi") return <KpiCardInner {...props} />;
	if (props.type === "data") return <DataCardInner {...props} />;
	if (props.type === "lineGraph") return <LineGraphCardInner {...props} />;
	if (props.type === "barChart") return <BarChartCardInner {...props} />;
	if (props.type === "list") return <ListCardInner {...props} />;
	return <TableCardInner {...props} />;
}
