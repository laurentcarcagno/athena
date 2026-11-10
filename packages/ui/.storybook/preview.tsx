import '../src/themes.generated.css';
import '../src/styles.css';

export const decorators = [(Story: () => JSX.Element) => <div className="ath-root"><Story /></div>];
export const parameters = { layout: 'padded' };
