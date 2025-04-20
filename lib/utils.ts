import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Creates a throttled version of a function that limits concurrent executions
 * @param fn The function to throttle
 * @param maxConcurrent Maximum number of concurrent executions allowed
 * @returns A throttled version of the function
 */
export function throttle<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  maxConcurrent: number = 4
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
  let runningCount = 0;
  const queue: Array<{
    args: Parameters<T>;
    resolve: (value: Awaited<ReturnType<T>>) => void;
    reject: (reason?: any) => void;
  }> = [];

  // Process the next item in the queue
  const processNext = async () => {
    if (runningCount >= maxConcurrent || queue.length === 0) {
      return;
    }

    // Get the next item from the queue
    const item = queue.shift();
    if (!item) return;

    // Increment the running count
    runningCount++;

    try {
      // Execute the function
      const result = await fn(...item.args);
      // Resolve the promise
      item.resolve(result);
    } catch (error) {
      // Reject the promise if there's an error
      item.reject(error);
    } finally {
      // Decrement the running count and process the next item
      runningCount--;
      processNext();
    }
  };

  // Return a throttled version of the function
  return (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    return new Promise((resolve, reject) => {
      // Add the function call to the queue
      queue.push({ args, resolve, reject });
      // Try to process the queue
      processNext();
    });
  };
}

/**
 * Optimized for Vercel serverless environment: 
 * Sleep function for waiting before retrying operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param retries Number of retries
 * @param delay Initial delay in ms
 */
export async function retry<T>(
  fn: () => Promise<T>, 
  retries: number = 3, 
  delay: number = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    
    await sleep(delay);
    return retry(fn, retries - 1, delay * 2);
  }
}
