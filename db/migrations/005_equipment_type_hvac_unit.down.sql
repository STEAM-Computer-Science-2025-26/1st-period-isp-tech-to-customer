-- Revert: remove hvac_unit from the equipment_type check constraint
ALTER TABLE equipment DROP CONSTRAINT IF EXISTS equipment_equipment_type_check;

ALTER TABLE equipment ADD CONSTRAINT equipment_equipment_type_check
  CHECK (equipment_type = ANY (ARRAY[
    'furnace', 'ac', 'heat_pump', 'air_handler', 'thermostat',
    'water_heater', 'boiler', 'mini_split', 'package_unit', 'other'
  ]));
