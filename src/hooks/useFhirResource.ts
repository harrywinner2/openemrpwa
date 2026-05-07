import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export function useFhirQuery<T>(
  key: readonly unknown[],
  fetcher: () => Promise<T>,
  enabled = true,
): UseQueryResult<T> {
  return useQuery({
    queryKey: key,
    queryFn: fetcher,
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
}
