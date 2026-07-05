export type AppNavigate = (href: string) => void;

export type RoutedPageProps = {
  currentPath: string;
  navigate: AppNavigate;
};
