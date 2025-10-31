// List of common categories - UPDATED with custom sort
export const categoryOptions = [
  { value: '950_rent', label: '950 - Rent' },
  { value: '952_utilities_el', label: '952 - Electricity' },
  { value: '953_water', label: '953 - Water' },
  { value: '954_heating', label: '954 - Heating' },
  { value: '956_fiber_wifi', label: '956 - Fiber/Wifi' },
  { value: '958_internet', label: '958 - Internet' },
  { value: '960_cleaning_services', label: '960 - Cleaning services' },
  { value: '962_cleaning_move_out', label: '962 - Cleaning, at move-out' },
  { value: '964_parking', label: '964 - Parking' },
  { value: '970_maintenance', label: '970 - Maintenance' },
  { value: '972_maintenance_move_out', label: '972 - Maintenance, at move-out' },
  { value: '974_other', label: '974 - Other' },
  { value: '975_small_furniture', label: '975 - Small Furniture' },
  { value: '976_council_tax', label: '976 - Council Tax', countries: ['United Kingdom'] }, // NEW: Council Tax for UK
  { value: '3055_subcontractors', label: '3055 - Subcontractors' },
  { value: '3056_otg_service_team_costs', label: '3056 - OTG - Service Team Costs' },
  { value: '3057_storage_units_facilities', label: '3057 - Storage Units & Facilities' },
  { value: '3075_software', label: '3075 - Software' },
  { value: '3079_fines', label: '3079 - Fines' },
  { value: '3089_car_fuel', label: '3089 - Car fuel' },
  { value: '3090_car_taxes', label: '3090 - Car taxes' },
  { value: '3091_car_insurance', label: '3091 - Car Insurance' },
  { value: '3092_bridge_ferry_tolls', label: '3092 - Bridge, ferry and tolls' },
  { value: '3102_office_rent', label: '3102 - Office rent' },
  { value: '3115_office_phone_internet', label: '3115 - Office Phone and internet' },
  { value: '3122_accountant', label: '3122 - Accountant' },
  { value: '3125_lawyer', label: '3125 - Lawyer' },
  { value: '3147_company_insurance', label: '3147 - Company insurance' },
  { value: '3157_postage', label: '3157 - Postage' },
  { value: '3444_restaurant_visits', label: '3444 - Restaurant visits' },
  { value: '3469_gifts_flowers', label: '3469 - Gifts and flowers' },
  { value: '3476_travel_hotels', label: '3476 - Travel and hotels' },
  { value: '3480_marketing', label: '3480 – Marketing' },
  { value: '5201_provider_deposit', label: '5201 – Provider Deposit' },
  { value: '8201_customer_deposit', label: '8201 - Customer Deposit' },
].sort((a, b) => {
  // Extract numerical prefix from label
  const getPrefix = (label: string) => {
    const match = label.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : Infinity; // Use Infinity for items without a numerical prefix to push them to the end
  };

  const prefixA = getPrefix(a.label);
  const prefixB = getPrefix(b.label);

  if (prefixA !== prefixB) {
    return prefixA - prefixB; // Sort by numerical prefix
  }
  return a.label.localeCompare(b.label); // Fallback to alphabetical sort
});