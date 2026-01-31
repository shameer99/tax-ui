export interface NavItem {
  id: string;
  label: string;
}

export interface FileItem {
  id: string;
  label: string;
  isPending?: boolean;
  status?: "extracting-year" | "parsing";
}
