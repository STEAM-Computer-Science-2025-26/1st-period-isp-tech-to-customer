import { DispatchTimeSettings } from './jobTypes';

export type CompanyDataType = { // Structure for company data as stored in the database
  id: string;
  name: string;
  createdAt: string;  // ISO 8601
  settings: {
    dispatchSettings: DispatchTimeSettings;
  };
};


export type CreateCompanyInput = {
  name: string;
  adminEmail: string;     // First admin user for this company
  adminPassword: string;  // Will be hashed internally
  dispatchSettings?: DispatchTimeSettings;  // Optional; defaults applied internally
};

export type CreateCompanySuccess = {
  companyId: string;
  adminUserId: string;  // The first admin user that was created
  company?: CompanyDataType; // Optional: return full company for convenience
};


export type GetCompanyInput = {
  companyId: string;
};

export type GetCompanySuccess = {
  company: CompanyDataType;
};


export type UpdateCompanySettingsInput = {
  companyId: string;
  dispatchSettings: Partial<DispatchTimeSettings>;  // Only update provided fields
};

export type UpdateCompanySettingsSuccess = {
  success: true;
  company?: CompanyDataType;  // Optional: return updated company
};
