/**
 * 按模拟时间触发的延迟回调。同一时刻的任务按登记顺序执行（保证确定性）。
 */
export interface Task {
  time: number;
  seq: number;
  fn: (() => void) | null;
}

export class Scheduler {
  private readonly tasks: Task[] = [];
  private seq = 0;

  /** 在模拟时间 time 执行 fn。返回的句柄可传给 cancel */
  at(time: number, fn: () => void): Task {
    const task: Task = { time, seq: this.seq++, fn };
    const tasks = this.tasks;
    // 任务量很小(几十个)，插入排序即可；保持按 (time, seq) 升序
    let i = tasks.length;
    tasks.push(task);
    while (i > 0 && tasks[i - 1].time > time) {
      tasks[i] = tasks[i - 1];
      i--;
    }
    tasks[i] = task;
    return task;
  }

  cancel(task: Task | null | undefined): void {
    if (task) task.fn = null;
  }

  /** 执行所有到期任务。回调里可以继续登记新任务（同一 tick 到期的也会被执行） */
  run(now: number): void {
    const tasks = this.tasks;
    while (tasks.length > 0 && tasks[0].time <= now + 1e-9) {
      const task = tasks.shift() as Task;
      const fn = task.fn;
      if (fn) {
        task.fn = null;
        fn();
      }
    }
  }

  get pending(): number {
    return this.tasks.length;
  }
}
