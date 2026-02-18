import { cn } from '@/lib/utils/index'

const ListPanel = <T extends Record<string, unknown>>({
  columns,
  columnKeys,
  data,
}: {
  columns: string[]
  columnKeys: (keyof T)[]
  data: T[]
}) => {
  const columnsCount = columns.length

  return (
    <div className={cn('w-full bg-background-primary rounded-xl border border-background-secondary relative pt-12')}>
      <div
        className={cn('border-b border-b-secondary/50 h-12 absolute top-0 inset-x-4 items-center grid')}
        style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))` }}
      >
        {columns.map((title, i) => (
          <p key={i} className={cn('text-sm font-medium text-foreground/60')}>
            {title}
          </p>
        ))}
      </div>

      <ul className={cn('w-full divide-y divide-background-secondary/50')}>
        {data.map((row, rowIndex) => (
          <li
            key={rowIndex}
            className={cn('grid px-4 py-3')}
            style={{ gridTemplateColumns: `repeat(${columnsCount}, minmax(0, 1fr))` }}
          >
            {columnKeys.map((key) => (
              <p key={String(key)} className={cn('text-sm')}>
                {String(row[key] ?? '—')}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default ListPanel