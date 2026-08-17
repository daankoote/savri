export type AppNavigateOptions = {
  replace?: boolean;
};

export type AppNavigate = (href: string, options?: AppNavigateOptions) => void;

export type RoutedPageProps = {
  currentPath: string;
  navigate: AppNavigate;
};
