import { Platform } from 'react-native';

import apiClient from './client';
import type { Pagination } from './orders';

export type Product = {
  id: string;
  name: string;
  code: string;
  company: string;
  packing: string | null;
  unit: string | null;
  mrp: number;
  salePrice: number;
  discount: number;
  schemeEnabled: boolean;
  schemePurchaseQty: number | null;
  schemeBonusQty: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

// The create payload, already normalised the way the web ProductForm sends
// it: trimmed strings, blanks as null, numbers as numbers.
export type ProductInput = {
  name: string;
  code: string;
  company: string | null;
  packing: string | null;
  unit: string | null;
  mrp: number;
  salePrice: number;
  discount: number;
  schemeEnabled: boolean;
  schemePurchaseQty: number | null;
  schemeBonusQty: number | null;
};

export type ListProductsParams = {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  company?: string;
  // Fetches exactly these products, ignoring pagination - used to re-price
  // a saved draft's lines from the products' current values in one call.
  ids?: string[];
};

export function listProducts(
  params: ListProductsParams = {}
): Promise<{ products: Product[]; pagination: Pagination }> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.isActive !== undefined) query.set('isActive', String(params.isActive));
  if (params.company) query.set('company', params.company);
  if (params.ids?.length) query.set('ids', params.ids.join(','));
  const suffix = query.toString();
  return apiClient.get(`/products${suffix ? `?${suffix}` : ''}`);
}

export function createProduct(input: ProductInput): Promise<{ product: Product }> {
  return apiClient.post('/products', input);
}

export function getProduct(id: string): Promise<{ product: Product }> {
  return apiClient.get(`/products/${id}`);
}

// Partial update: a field missing from the body is left untouched, so
// `{ isActive: true }` alone reactivates a product.
export function updateProduct(
  id: string,
  input: Partial<ProductInput> & { isActive?: boolean }
): Promise<{ product: Product }> {
  return apiClient.put(`/products/${id}`, input);
}

// Soft delete - the product is marked inactive and can be reactivated.
export function deactivateProduct(id: string): Promise<{ product: Product }> {
  return apiClient.delete(`/products/${id}`);
}

// The distinct manufacturers products are assigned to - the options of the
// company filter in the product browser.
export function listProductCompanies(): Promise<{ companies: string[] }> {
  return apiClient.get('/products/companies');
}

// --- Bulk import ------------------------------------------------------

export type ImportSummary = {
  totalRows: number;
  newProducts: number;
  updatedProducts: number;
  invalidRows: number;
  generatedCodes?: number;
};

export type ImportError = { row: number; field: string; message: string };

export type ImportUpdate = { row: number; code: string; name: string; matchedBy: 'code' | 'name' };

export type ImportValidation = {
  isValid: boolean;
  summary: ImportSummary;
  errors: ImportError[];
  updates?: ImportUpdate[];
  unmappedHeaders?: string[];
};

export type ImportResult = { message: string; summary: ImportSummary };

// A file picked with expo-document-picker. `type` is the picker's MIME
// type, which is often missing or a generic octet-stream for spreadsheets.
export type UploadFile = { uri: string; name?: string | null; type?: string | null };

// What the server accepts, keyed by extension. The server itself only
// checks the extension (MIME types for .xlsx vary wildly between platforms),
// so the type here is a courtesy that keeps proxies and logs sensible.
const MIME_BY_EXTENSION: Record<string, string> = {
  '.csv': 'text/csv',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const DEFAULT_UPLOAD_NAME = 'import.csv';

function mimeTypeFor(name: string, picked?: string | null) {
  if (picked && picked !== 'application/octet-stream') return picked;
  const extension = Object.keys(MIME_BY_EXTENSION).find((ext) => name.toLowerCase().endsWith(ext));
  return extension ? MIME_BY_EXTENSION[extension] : 'text/csv';
}

// The multipart part React Native's networking layer expects for a file:
// a plain {uri, name, type} object, not a Blob.
//
// The URI is handed over as the picker returned it on Android (file:// or
// content://, both of which Android's networking resolves), while iOS gets
// a bare filesystem path - the form the iOS layer has always accepted for
// a local file. The name always carries a spreadsheet extension because
// that is the one thing the server's upload filter checks.
export function toUploadPart(file: UploadFile) {
  const name = file.name?.trim() || DEFAULT_UPLOAD_NAME;
  return {
    uri: Platform.OS === 'android' ? file.uri : file.uri.replace('file://', ''),
    name,
    type: mimeTypeFor(name, file.type),
  };
}

function fileForm(file: UploadFile) {
  const form = new FormData();
  // The RN FormData typing only knows Blob | string; the {uri,name,type}
  // object is what the native layer actually expects for a file.
  form.append('file', toUploadPart(file) as unknown as Blob);
  return form;
}

// Checks a .xlsx/.csv file without saving anything - the first half of the
// two-step import.
export function validateProductImport(file: UploadFile): Promise<ImportValidation> {
  return apiClient.postForm('/products/validate-bulk', fileForm(file));
}

// Imports a validated file. All-or-nothing: if anything is wrong nothing is
// written and the rejection (422) carries the same row-level errors in its
// body.
export function bulkUploadProducts(file: UploadFile): Promise<ImportResult> {
  return apiClient.postForm('/products/bulk-upload', fileForm(file));
}
